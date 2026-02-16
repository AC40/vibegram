import { type Api, InputFile } from 'grammy';
import { readFile, readdir, stat } from 'fs/promises';
import { basename, join } from 'path';
import { homedir } from 'os';
import type { BackendEvent } from '../types/claude.js';
import type { Session, UserSettings } from '../types/session.js';
import { StreamingEditor } from '../telegram/streaming-editor.js';
import { postfixEmoji } from '../telegram/renderer.js';
import { buildPlanApprovalKeyboard } from '../telegram/keyboard-builder.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import { logger } from '../utils/logger.js';
import * as historyRepo from '../db/history-repository.js';
import { sendChangeSummary, calcWriteStats, calcEditStats, type FileOperation } from '../services/file-sender.js';

const streamingEditors = new Map<string, StreamingEditor>();
const sawTextDelta = new Set<string>();
const codexTurnBuffer = new Map<string, string>();

const lastPlanFilePaths = new Map<string, string>();
const pendingPlanApprovals = new Set<string>();
const pendingPlanTexts = new Map<string, string>();
const eventChains = new Map<string, Promise<void>>();
const currentAssistantTurns = new Map<string, number>();
const pendingFileOps = new Map<string, FileOperation[]>();
const assistantTextBuffers = new Map<string, string>();

const MAX_DETAIL_LENGTH = 80;

function truncate(text: string, max: number = MAX_DETAIL_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function extractProposedPlan(text: string): string | null {
  const match = text.match(/<proposed_plan>[\s\S]*?<\/proposed_plan>/i);
  return match ? match[0] : null;
}

function formatToolDetail(toolName: string, input: Record<string, unknown>): string | undefined {
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return typeof input['file_path'] === 'string' ? input['file_path'] : undefined;
    case 'Bash':
      return typeof input['command'] === 'string' ? truncate(input['command']) : undefined;
    case 'Glob':
    case 'Grep':
      return typeof input['pattern'] === 'string' ? input['pattern'] : undefined;
    case 'WebFetch':
      return typeof input['url'] === 'string' ? truncate(input['url']) : undefined;
    case 'WebSearch':
      return typeof input['query'] === 'string' ? truncate(input['query']) : undefined;
    case 'Task':
      return typeof input['description'] === 'string' ? truncate(input['description']) : undefined;
    default:
      return undefined;
  }
}

function getNotificationSetting(event: BackendEvent, settings: UserSettings): boolean {
  if (settings.notificationMode === 'all') return false;
  if (settings.notificationMode === 'none') return true;
  if (event.type === 'result') return false;
  return true;
}

function shouldShowMessage(session: Session, settings: UserSettings): boolean {
  if (settings.crossSessionVisibility === 'show_all') return true;
  const activeId = sessionManager.getActiveSessionId(session.userId);
  return session.id === activeId;
}

export function routeBackendEvent(api: Api, chatId: number, session: Session, event: BackendEvent): void {
  const prev = eventChains.get(session.id) ?? Promise.resolve();
  const next = prev.then(() => processEvent(api, chatId, session, event)).catch((error) => {
    logger.error({ error, sessionId: session.id }, 'Event processing error');
  });
  eventChains.set(session.id, next);

  if (event.type === 'result' || event.type === 'error') {
    next.then(() => eventChains.delete(session.id));
  }
}

// Backward-compatible name used by existing imports.
export const routeClaudeEvent = routeBackendEvent;

async function processEvent(api: Api, chatId: number, session: Session, event: BackendEvent): Promise<void> {
  const settings = sessionManager.getSettings(session.userId);
  const disableNotification = getNotificationSetting(event, settings);

  if (!shouldShowMessage(session, settings)) {
    if (event.type === 'text_done' || event.type === 'result' || event.type === 'error') {
      let text = '';
      if (event.type === 'text_done') text = event.fullText;
      else if (event.type === 'result') text = 'Done.';
      else if (event.type === 'error') text = `Error: ${event.message}`;

      sessionManager.bufferMessage(session.id, {
        sessionId: session.id,
        text: postfixEmoji(text, session.emoji),
        timestamp: Date.now(),
        disableNotification,
      });
    }
    return;
  }

  switch (event.type) {
    case 'init':
      sessionManager.updateSessionBackendId(session.id, event.sessionId);
      break;

    case 'text_delta': {
      const buffer = assistantTextBuffers.get(session.id) ?? '';
      assistantTextBuffers.set(session.id, buffer + event.text);
      sawTextDelta.add(session.id);

      if (settings.verbosity !== 'minimal') {
        let editor = streamingEditors.get(session.id);
        if (!editor) {
          editor = new StreamingEditor(api, chatId, session.emoji);
          streamingEditors.set(session.id, editor);
        }
        await editor.appendText(event.text);
      }
      break;
    }

    case 'text_done': {
      const buffered = assistantTextBuffers.get(session.id) ?? '';
      const fullText = buffered || event.fullText;
      assistantTextBuffers.delete(session.id);

      if (session.backend === 'codex') {
        const previous = codexTurnBuffer.get(session.id) ?? '';
        const combined = previous ? `${previous}\n\n${fullText}` : fullText;
        codexTurnBuffer.set(session.id, combined);
        const plan = extractProposedPlan(combined);
        if (plan) {
          pendingPlanApprovals.add(session.id);
          pendingPlanTexts.set(session.id, plan);
        }
      }

      if (settings.verbosity === 'minimal') {
        if (fullText) {
          const { renderMarkdown } = await import('../telegram/renderer.js');
          const rendered = postfixEmoji(renderMarkdown(fullText), session.emoji);
          try {
            await api.sendMessage(chatId, rendered, {
              parse_mode: 'MarkdownV2',
              disable_notification: disableNotification,
            });
          } catch {
            await api.sendMessage(chatId, postfixEmoji(fullText, session.emoji), {
              disable_notification: disableNotification,
            });
          }
        }
      } else {
        let editor = streamingEditors.get(session.id);
        if (!editor) {
          editor = new StreamingEditor(api, chatId, session.emoji);
          streamingEditors.set(session.id, editor);
        }

        if (!sawTextDelta.has(session.id) && fullText) {
          await editor.appendText(fullText);
        }

        await editor.finalize(disableNotification);
        streamingEditors.delete(session.id);
      }

      sawTextDelta.delete(session.id);

      if (fullText) {
        const turn = historyRepo.addAssistantTurn(session.id, fullText);
        currentAssistantTurns.set(session.id, turn.id);
      }
      break;
    }

    case 'tool_use': {
      if (event.toolName === 'Write' && typeof event.input['file_path'] === 'string') {
        const filePath = event.input['file_path'];
        if (filePath.includes('.claude/plans/')) {
          lastPlanFilePaths.set(session.id, filePath);
        }
      }

      if ((event.toolName === 'Write' || event.toolName === 'Edit') && typeof event.input['file_path'] === 'string') {
        const filePath = event.input['file_path'];
        if (!filePath.includes('.claude/plans/')) {
          const ops = pendingFileOps.get(session.id) ?? [];
          if (event.toolName === 'Write' && typeof event.input['content'] === 'string') {
            const stats = calcWriteStats(event.input['content']);
            ops.push({ type: 'write', filePath, ...stats });
          } else if (event.toolName === 'Edit') {
            const oldStr = typeof event.input['old_string'] === 'string' ? event.input['old_string'] : '';
            const newStr = typeof event.input['new_string'] === 'string' ? event.input['new_string'] : '';
            const stats = calcEditStats(oldStr, newStr);
            ops.push({ type: 'edit', filePath, ...stats });
          }
          pendingFileOps.set(session.id, ops);
        }
      }

      const turnId = currentAssistantTurns.get(session.id) ?? null;
      const filePath = ['Write', 'Edit'].includes(event.toolName)
        ? (event.input['file_path'] as string | undefined)
        : undefined;
      historyRepo.addToolInvocation(session.id, turnId, event.toolName, event.input, filePath);

      if (event.toolName === 'ExitPlanMode') {
        pendingPlanApprovals.add(session.id);
        break;
      }

      if (settings.verbosity === 'verbose') {
        const detail = formatToolDetail(event.toolName, event.input);
        const toolMsg = detail ? `🔧 ${event.toolName}: ${detail}` : `🔧 ${event.toolName}`;
        await api.sendMessage(chatId, postfixEmoji(toolMsg, session.emoji), {
          disable_notification: true,
        });
      }
      break;
    }

    case 'tool_result':
      break;

    case 'result': {
      const resultEditor = streamingEditors.get(session.id);
      if (resultEditor) {
        await resultEditor.finalize(disableNotification);
        streamingEditors.delete(session.id);
      }

      const turnId = currentAssistantTurns.get(session.id);
      if (turnId) {
        historyRepo.updateTurnCost(turnId, event.costUsd);
        currentAssistantTurns.delete(session.id);
      }

      assistantTextBuffers.delete(session.id);

      if (settings.verbosity !== 'minimal') {
        const durationStr = `${(event.durationMs / 1000).toFixed(1)}s`;
        const summary = event.costUsd > 0
          ? `✅ Done (${durationStr}, $${event.costUsd.toFixed(4)}, ${event.numTurns} turns)`
          : `✅ Done (${durationStr}, ${event.numTurns} turns)`;
        await api.sendMessage(chatId, postfixEmoji(summary, session.emoji), {
          disable_notification: disableNotification,
        });
      }

      const fileOps = pendingFileOps.get(session.id) ?? [];
      pendingFileOps.delete(session.id);
      if (settings.fileSharingMode !== 'off' && fileOps.length > 0) {
        try {
          await sendChangeSummary(api, chatId, fileOps, session.emoji);
        } catch (error) {
          logger.warn({ error }, 'Failed to send change summary to Telegram');
        }
      }

      const queue = getQueue(session.id);
      queue.setProcessing(false);
      queue.setCurrentTurnId(null);

      if (pendingPlanApprovals.has(session.id)) {
        pendingPlanApprovals.delete(session.id);
        sessionManager.updateSessionStatus(session.id, 'awaiting_input');
        await sendPlanApproval(api, chatId, session);
      } else {
        sessionManager.updateSessionStatus(session.id, 'idle');
        await queue.processNext();
      }

      sawTextDelta.delete(session.id);
      codexTurnBuffer.delete(session.id);
      break;
    }

    case 'error': {
      const errorEditor = streamingEditors.get(session.id);
      if (errorEditor) {
        await errorEditor.finalize(true);
        streamingEditors.delete(session.id);
      }

      await api.sendMessage(chatId, postfixEmoji(`❌ ${event.message}`, session.emoji), {
        disable_notification: false,
      });

      sawTextDelta.delete(session.id);
      codexTurnBuffer.delete(session.id);
      pendingPlanApprovals.delete(session.id);
      pendingPlanTexts.delete(session.id);
      assistantTextBuffers.delete(session.id);
      pendingFileOps.delete(session.id);
      currentAssistantTurns.delete(session.id);

      sessionManager.updateSessionStatus(session.id, 'idle');
      const queue = getQueue(session.id);
      queue.setProcessing(false);
      queue.setCurrentTurnId(null);
      await queue.processNext();
      break;
    }

    case 'processing':
      if (settings.verbosity === 'verbose') {
        await api.sendMessage(chatId, postfixEmoji(`⏳ ${event.message}`, session.emoji), {
          disable_notification: true,
        });
      }
      break;
  }
}

async function findPlanFile(sessionId: string): Promise<string | null> {
  const tracked = lastPlanFilePaths.get(sessionId);
  if (tracked) {
    try {
      await stat(tracked);
      return tracked;
    } catch {
      // Fallback path search below.
    }
  }

  const plansDir = join(homedir(), '.claude', 'plans');
  try {
    const files = await readdir(plansDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    if (mdFiles.length === 0) return null;

    const now = Date.now();
    let bestPath: string | null = null;
    let bestMtime = 0;

    for (const file of mdFiles) {
      const fullPath = join(plansDir, file);
      const fileStat = await stat(fullPath);
      const age = now - fileStat.mtimeMs;
      if (age < 60_000 && fileStat.mtimeMs > bestMtime) {
        bestMtime = fileStat.mtimeMs;
        bestPath = fullPath;
      }
    }

    return bestPath;
  } catch {
    return null;
  }
}

async function sendPlanApproval(api: Api, chatId: number, session: Session): Promise<void> {
  const keyboard = buildPlanApprovalKeyboard(session.id, session.backend);
  const caption = postfixEmoji('📋 Plan ready for review', session.emoji);

  if (session.backend === 'codex') {
    const planText = pendingPlanTexts.get(session.id);
    pendingPlanTexts.delete(session.id);

    if (planText) {
      const filename = `proposed-plan-${Date.now()}.md`;
      await api.sendDocument(chatId, new InputFile(Buffer.from(planText), filename), {
        caption,
        reply_markup: keyboard,
      });
      return;
    }
  } else {
    const planPath = await findPlanFile(session.id);
    lastPlanFilePaths.delete(session.id);
    pendingPlanTexts.delete(session.id);

    if (planPath) {
      try {
        const content = await readFile(planPath, 'utf-8');
        const filename = basename(planPath);
        await api.sendDocument(chatId, new InputFile(Buffer.from(content), filename), {
          caption,
          reply_markup: keyboard,
        });
        return;
      } catch (error) {
        logger.warn({ error, planPath, sessionId: session.id }, 'Failed to read plan file');
      }
    }
  }

  await api.sendMessage(chatId, caption, { reply_markup: keyboard });
}
