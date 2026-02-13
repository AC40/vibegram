import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import { browseDirectory } from '../telegram/directory-browser.js';
import { buildNotificationKeyboard, buildVerbosityKeyboard, buildVisibilityKeyboard, buildPermissionModeKeyboard, buildSettingsKeyboard, buildHistoryPaginationKeyboard } from '../telegram/keyboard-builder.js';
import { postfixEmoji } from '../telegram/renderer.js';
import type { ClaudeBridge } from '../claude/claude-bridge.js';
import { resolvePath } from '../telegram/path-registry.js';
import { logger } from '../utils/logger.js';
import type { CrossSessionVisibility, NotificationMode, Session, Verbosity } from '../types/session.js';
import * as historyRepo from '../db/history-repository.js';
import { formatHistoryPage, ITEMS_PER_PAGE } from '../commands/history.js';

let claudeBridge: ClaudeBridge | null = null;
let pendingNewSession: Map<number, string> = new Map(); // userId → sessionName

export function setCallbackBridge(bridge: ClaudeBridge): void {
  claudeBridge = bridge;
}

export function setPendingNewSession(userId: number, name: string): void {
  pendingNewSession.set(userId, name);
}

export async function handleCallbackQuery(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [action, ...rest] = data.split(':');
    const payload = rest.join(':');

    switch (action) {
      case 'switch':
        await handleSwitch(ctx, userId, payload);
        break;

      case 'delete':
        await handleDelete(ctx, userId, payload);
        break;

      case 'confirm':
        await handleConfirm(ctx, userId, rest);
        break;

      case 'cd':
        await handleCd(ctx, userId, payload);
        break;

      case 'sel':
        await handleSelectDir(ctx, userId, payload);
        break;

      case 'mode':
        await handleMode(ctx, userId, payload);
        break;

      case 'notify':
        await handleNotify(ctx, userId, payload);
        break;

      case 'verbosity':
        await handleVerbosity(ctx, userId, payload);
        break;

      case 'visibility':
        await handleVisibility(ctx, userId, payload);
        break;

      case 'settings':
        await handleSettingsMenu(ctx, userId, payload);
        break;

      case 'plan':
        await handlePlanAction(ctx, userId, rest);
        break;

      case 'history':
        await handleHistoryPagination(ctx, userId, rest);
        break;

      case 'cancel_action':
        await ctx.editMessageText('Cancelled.');
        break;

      default:
        logger.warn({ action, data }, 'Unknown callback action');
    }
  } catch (error) {
    logger.error({ error, data }, 'Callback query error');
    await ctx.answerCallbackQuery({ text: 'Error processing action.' });
  }
}

async function handleSwitch(ctx: BotContext, userId: number, sessionId: string): Promise<void> {
  const { session, buffered } = sessionManager.switchSession(userId, sessionId);
  await ctx.answerCallbackQuery({ text: `Switched to ${session.emoji} ${session.name}` });
  await ctx.editMessageText(`Switched to ${session.emoji} ${session.name}\nDirectory: ${session.cwd}`);

  // Replay buffered messages
  if (buffered.length > 0) {
    await ctx.reply(`--- Replaying ${buffered.length} buffered messages from ${session.emoji} ${session.name} ---`);
    for (const msg of buffered) {
      await ctx.reply(msg.text, { disable_notification: msg.disableNotification });
    }
  }
}

async function handleDelete(ctx: BotContext, userId: number, sessionId: string): Promise<void> {
  const session = sessionManager.getSessions(userId).find((s) => s.id === sessionId);
  if (!session) {
    await ctx.answerCallbackQuery({ text: 'Session not found.' });
    return;
  }

  if (claudeBridge) {
    await claudeBridge.destroySession(session.id);
  }

  sessionManager.deleteSession(userId, sessionId);
  await ctx.answerCallbackQuery({ text: `Deleted ${session.emoji} ${session.name}` });
  await ctx.editMessageText(`Deleted ${session.emoji} ${session.name}`);
}

async function handleConfirm(ctx: BotContext, userId: number, rest: string[]): Promise<void> {
  const [action, targetId] = rest;
  if (action === 'delete' && targetId) {
    await handleDelete(ctx, userId, targetId);
  }
}

async function handleCd(ctx: BotContext, userId: number, idStr: string): Promise<void> {
  const path = resolvePath(Number(idStr));
  if (!path) {
    await ctx.answerCallbackQuery({ text: 'Path expired. Try again.' });
    return;
  }
  const { keyboard, resolvedPath } = browseDirectory(path);
  await ctx.editMessageText(`📁 ${resolvedPath}`, { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
}

async function handleSelectDir(ctx: BotContext, userId: number, idStr: string): Promise<void> {
  const path = resolvePath(Number(idStr));
  if (!path) {
    await ctx.answerCallbackQuery({ text: 'Path expired. Try again.' });
    return;
  }

  // Check if this is for a new session
  const pendingName = pendingNewSession.get(userId);
  if (pendingName !== undefined) {
    pendingNewSession.delete(userId);

    let sessionName = pendingName;
    if (!sessionName) {
      const base = path.split('/').filter(Boolean).pop() ?? 'session';
      const existing = sessionManager.getSessions(userId);
      const taken = new Set(existing.map((s) => s.name));
      sessionName = base;
      let idx = 2;
      while (taken.has(sessionName)) {
        sessionName = `${base}-${idx++}`;
      }
    }

    const session = sessionManager.createSession(userId, sessionName, path);
    await ctx.editMessageText(
      `Created ${session.emoji} ${session.name}\nDirectory: ${path}`
    );
    await ctx.answerCallbackQuery({ text: 'Session created!' });
    return;
  }

  // Otherwise it's a /cd change
  const session = sessionManager.getActiveSession(userId);
  if (session) {
    sessionManager.updateSessionCwd(session.id, path);
    await ctx.editMessageText(`${session.emoji} Directory changed to: ${path}`);
  }
  await ctx.answerCallbackQuery({ text: `Directory: ${path}` });
}

async function handleMode(ctx: BotContext, userId: number, mode: string): Promise<void> {
  const session = sessionManager.getActiveSession(userId);
  if (session) {
    sessionManager.updateSessionPermissionMode(session.id, mode);
    await ctx.editMessageText(`Permission mode set to: ${mode} ${session.emoji}`);
  }
  await ctx.answerCallbackQuery({ text: `Mode: ${mode}` });
}

async function handleNotify(ctx: BotContext, userId: number, mode: string): Promise<void> {
  sessionManager.updateSettings(userId, { notificationMode: mode as NotificationMode });
  const settings = sessionManager.getSettings(userId);
  await ctx.editMessageText('🔔 Notification mode updated', {
    reply_markup: buildNotificationKeyboard(settings.notificationMode),
  });
  await ctx.answerCallbackQuery({ text: `Notifications: ${mode}` });
}

async function handleVerbosity(ctx: BotContext, userId: number, level: string): Promise<void> {
  sessionManager.updateSettings(userId, { verbosity: level as Verbosity });
  const settings = sessionManager.getSettings(userId);
  await ctx.editMessageText('📝 Verbosity updated', {
    reply_markup: buildVerbosityKeyboard(settings.verbosity),
  });
  await ctx.answerCallbackQuery({ text: `Verbosity: ${level}` });
}

async function handleVisibility(ctx: BotContext, userId: number, mode: string): Promise<void> {
  sessionManager.updateSettings(userId, { crossSessionVisibility: mode as CrossSessionVisibility });
  const settings = sessionManager.getSettings(userId);
  await ctx.editMessageText('👁 Cross-session visibility updated', {
    reply_markup: buildVisibilityKeyboard(settings.crossSessionVisibility),
  });
  await ctx.answerCallbackQuery({ text: `Visibility: ${mode}` });
}

async function handleSettingsMenu(ctx: BotContext, userId: number, section: string): Promise<void> {
  const settings = sessionManager.getSettings(userId);

  switch (section) {
    case 'notifications':
      await ctx.editMessageText('🔔 Notification mode:', {
        reply_markup: buildNotificationKeyboard(settings.notificationMode),
      });
      break;
    case 'verbosity':
      await ctx.editMessageText('📝 Verbosity level:', {
        reply_markup: buildVerbosityKeyboard(settings.verbosity),
      });
      break;
    case 'visibility':
      await ctx.editMessageText('👁 Cross-session visibility:', {
        reply_markup: buildVisibilityKeyboard(settings.crossSessionVisibility),
      });
      break;
    case 'mode':
      await ctx.editMessageText('🔒 Permission mode:', {
        reply_markup: buildPermissionModeKeyboard(),
      });
      break;
  }
  await ctx.answerCallbackQuery();
}

async function handlePlanAction(ctx: BotContext, userId: number, rest: string[]): Promise<void> {
  const [action, sessionId] = rest;
  if (!action || !sessionId) return;

  const session = sessionManager.getSessions(userId).find((s) => s.id === sessionId);
  if (!session) {
    await ctx.answerCallbackQuery({ text: 'Session not found.' });
    return;
  }

  switch (action) {
    case 'bypass': {
      sessionManager.updateSessionPermissionMode(session.id, 'dontAsk');
      await updatePlanCaption(ctx, `✅ Plan approved (bypass mode) ${session.emoji}`);
      await ctx.answerCallbackQuery({ text: 'Plan approved — bypass mode' });
      await resumeWithMessage(session, 'Plan approved. Proceed.');
      break;
    }
    case 'accept': {
      sessionManager.updateSessionPermissionMode(session.id, 'acceptEdits');
      await updatePlanCaption(ctx, `✅ Plan approved (accept edits) ${session.emoji}`);
      await ctx.answerCallbackQuery({ text: 'Plan approved — accept edits' });
      await resumeWithMessage(session, 'Plan approved. Proceed.');
      break;
    }
    case 'changes': {
      await updatePlanCaption(ctx, `✏️ Send your feedback as a message ${session.emoji}`);
      await ctx.answerCallbackQuery({ text: 'Type your feedback' });
      // User types feedback normally; it resumes via --resume in the text handler
      break;
    }
    case 'abort': {
      await updatePlanCaption(ctx, `❌ Plan rejected ${session.emoji}`);
      await ctx.answerCallbackQuery({ text: 'Plan aborted' });
      await resumeWithMessage(session, 'Plan rejected. Do not implement.');
      break;
    }
    default:
      logger.warn({ action }, 'Unknown plan action');
  }
}

async function updatePlanCaption(ctx: BotContext, text: string): Promise<void> {
  try {
    await ctx.editMessageCaption({ caption: text });
  } catch {
    // Message might be a text message (fallback case), not a document
    try {
      await ctx.editMessageText(text);
    } catch (error) {
      logger.warn({ error }, 'Failed to update plan message');
    }
  }
}

async function handleHistoryPagination(ctx: BotContext, userId: number, rest: string[]): Promise<void> {
  const [sessionId, offsetStr] = rest;
  if (!sessionId || offsetStr === undefined) return;

  const session = sessionManager.getSessions(userId).find((s) => s.id === sessionId);
  if (!session) {
    await ctx.answerCallbackQuery({ text: 'Session not found.' });
    return;
  }

  const offset = parseInt(offsetStr, 10);
  const total = historyRepo.getHistoryCount(session.id);
  const turns = historyRepo.getHistory(session.id, ITEMS_PER_PAGE, offset);
  const page = Math.floor(offset / ITEMS_PER_PAGE) + 1;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const formatted = formatHistoryPage(turns, page, totalPages);

  await ctx.editMessageText(`${formatted} ${session.emoji}`, {
    reply_markup: buildHistoryPaginationKeyboard(session.id, offset, total, ITEMS_PER_PAGE),
  });
  await ctx.answerCallbackQuery();
}

async function resumeWithMessage(session: Session, message: string): Promise<void> {
  if (!claudeBridge) {
    logger.error({ sessionId: session.id }, 'Cannot resume: bridge not initialized');
    return;
  }

  const queue = getQueue(session.id);

  if (queue.isProcessing) {
    queue.enqueue({ text: message, timestamp: Date.now() });
    return;
  }

  queue.setProcessing(true);
  sessionManager.updateSessionStatus(session.id, 'processing');

  // Set up handler for queued follow-ups
  queue.setHandler(async (msg) => {
    await resumeWithMessage(
      sessionManager.getSessions(session.userId).find((s) => s.id === session.id) ?? session,
      msg.text,
    );
  });

  try {
    await claudeBridge.sendMessageWithOptions(session.id, message, {
      cwd: session.cwd,
      permissionMode: session.permissionMode,
      resume: session.claudeSessionId ?? undefined,
    });
  } catch (error) {
    logger.error({ error, sessionId: session.id }, 'Failed to resume session with plan action');
    queue.setProcessing(false);
    sessionManager.updateSessionStatus(session.id, 'idle');
  }
}
