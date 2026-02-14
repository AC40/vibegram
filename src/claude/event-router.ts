import { type Api, InputFile } from 'grammy';
import { readFile, readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join, basename } from 'path';
import type { ClaudeEvent } from '../types/claude.js';
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
const lastPlanFilePaths = new Map<string, string>();
const pendingPlanApprovals = new Set<string>();
const eventChains = new Map<string, Promise<void>>();
const currentAssistantTurns = new Map<string, number>();
const pendingFileOps = new Map<string, FileOperation[]>();
const assistantTextBuffers = new Map<string, string>();

const MAX_DETAIL_LENGTH = 80;

function truncate(text: string, max: number = MAX_DETAIL_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
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

function getNotificationSetting(event: ClaudeEvent, settings: UserSettings): boolean {
  // Returns `disable_notification` value
  if (settings.notificationMode === 'all') return false;
  if (settings.notificationMode === 'none') return true;

  // 'smart' mode
  if (event.type === 'result') return false;
  return true; // everything else is silent
}

function shouldShowMessage(session: Session, settings: UserSettings): boolean {
  if (settings.crossSessionVisibility === 'show_all') return true;
  const activeId = sessionManager.getActiveSessionId(session.userId);
  return session.id === activeId;
}

export function routeClaudeEvent(
  api: Api,
  chatId: number,
  session: Session,
  event: ClaudeEvent,
): void {
  const prev = eventChains.get(session.id) ?? Promise.resolve();
  const next = prev.then(() => processEvent(api, chatId, session, event)).catch((error) => {
    logger.error({ error, sessionId: session.id }, 'Event processing error');
  });
  eventChains.set(session.id, next);

  // Clean up chain on terminal events to prevent memory leak
  if (event.type === 'result' || event.type === 'error') {
    next.then(() => eventChains.delete(session.id));
  }
}

async function processEvent(
  api: Api,
  chatId: number,
  session: Session,
  event: ClaudeEvent,
): Promise<void> {
  const settings = sessionManager.getSettings(session.userId);
  const disableNotification = getNotificationSetting(event, settings);

  // Check cross-session visibility
  if (!shouldShowMessage(session, settings)) {
    if (event.type === 'text_done' || event.type === 'result' || event.type === 'error') {
      let text = '';
      if (event.type === 'text_done') text = event.fullText;
      else if (event.type === 'result') text = `Done. Cost: $${event.costUsd.toFixed(4)}`;
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
      sessionManager.updateSessionClaudeId(session.id, event.sessionId);
      break;

    case 'text_delta': {
      let editor = streamingEditors.get(session.id);
      if (!editor) {
        editor = new StreamingEditor(api, chatId, session.emoji);
        streamingEditors.set(session.id, editor);
      }
      await editor.appendText(event.text);

      // Buffer text for history persistence
      const buffer = assistantTextBuffers.get(session.id) ?? '';
      assistantTextBuffers.set(session.id, buffer + event.text);
      break;
    }

    case 'text_done': {
      // Finalize any streaming editor
      const editor = streamingEditors.get(session.id);
      if (editor) {
        await editor.finalize(disableNotification);
        streamingEditors.delete(session.id);
      }

      // Persist assistant turn to history
      const fullText = assistantTextBuffers.get(session.id) ?? event.fullText;
      assistantTextBuffers.delete(session.id);
      if (fullText) {
        const turn = historyRepo.addAssistantTurn(session.id, fullText);
        currentAssistantTurns.set(session.id, turn.id);
      }
      break;
    }

    case 'tool_use': {
      // Track Write events targeting the plans directory
      if (event.toolName === 'Write' && typeof event.input['file_path'] === 'string') {
        const filePath = event.input['file_path'];
        if (filePath.includes('.claude/plans/')) {
          lastPlanFilePaths.set(session.id, filePath);
        }
      }

      // Track Write/Edit operations for file change summary
      if ((event.toolName === 'Write' || event.toolName === 'Edit') && typeof event.input['file_path'] === 'string') {
        const filePath = event.input['file_path'];
        // Don't track plan files
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

      // Persist tool invocation to history
      const turnId = currentAssistantTurns.get(session.id) ?? null;
      const filePath = ['Write', 'Edit'].includes(event.toolName)
        ? (event.input['file_path'] as string | undefined)
        : undefined;
      historyRepo.addToolInvocation(session.id, turnId, event.toolName, event.input, filePath);

      // Intercept ExitPlanMode — flag for plan approval on result
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

    case 'result': {
      // Finalize streaming
      const resultEditor = streamingEditors.get(session.id);
      if (resultEditor) {
        await resultEditor.finalize(disableNotification);
        streamingEditors.delete(session.id);
      }

      // Update turn cost in history
      const turnId = currentAssistantTurns.get(session.id);
      if (turnId) {
        historyRepo.updateTurnCost(turnId, event.costUsd);
        currentAssistantTurns.delete(session.id);
      }

      // Clear text buffer
      assistantTextBuffers.delete(session.id);

      if (settings.verbosity !== 'minimal') {
        const costStr = `$${event.costUsd.toFixed(4)}`;
        const durationStr = `${(event.durationMs / 1000).toFixed(1)}s`;
        const summary = `✅ Done (${durationStr}, ${costStr}, ${event.numTurns} turns)`;
        await api.sendMessage(chatId, postfixEmoji(summary, session.emoji), {
          disable_notification: disableNotification,
        });
      }

      sessionManager.updateSessionStatus(session.id, 'idle');

      // Send file change summary if enabled
      const fileOps = pendingFileOps.get(session.id) ?? [];
      pendingFileOps.delete(session.id);
      if (settings.fileSharingMode !== 'off' && fileOps.length > 0) {
        try {
          await sendChangeSummary(api, chatId, fileOps, session.emoji);
        } catch (error) {
          logger.warn({ error }, 'Failed to send change summary to Telegram');
        }
      }

      // Send plan approval document if ExitPlanMode was called
      if (pendingPlanApprovals.has(session.id)) {
        pendingPlanApprovals.delete(session.id);
        await sendPlanApproval(api, chatId, session);
      }

      // Process next queued message
      const queue = getQueue(session.id);
      queue.setProcessing(false);
      queue.setCurrentTurnId(null);
      await queue.processNext();
      break;
    }

    case 'error': {
      // Finalize streaming
      const errorEditor = streamingEditors.get(session.id);
      if (errorEditor) {
        await errorEditor.finalize(true);
        streamingEditors.delete(session.id);
      }

      await api.sendMessage(chatId, postfixEmoji(`❌ ${event.message}`, session.emoji), {
        disable_notification: false,
      });

      sessionManager.updateSessionStatus(session.id, 'idle');

      // Process next queued message
      const errorQueue = getQueue(session.id);
      errorQueue.setProcessing(false);
      await errorQueue.processNext();
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
  // Primary: use tracked path from Write event
  const tracked = lastPlanFilePaths.get(sessionId);
  if (tracked) {
    try {
      await stat(tracked);
      return tracked;
    } catch {
      // File doesn't exist, try fallback
    }
  }

  // Fallback: glob plans directory for most recently modified .md file
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
  const keyboard = buildPlanApprovalKeyboard(session.id);
  const planPath = await findPlanFile(session.id);

  // Clean up tracked path
  lastPlanFilePaths.delete(session.id);

  if (planPath) {
    try {
      const content = await readFile(planPath, 'utf-8');
      const filename = basename(planPath);
      const caption = postfixEmoji('📋 Plan ready for review', session.emoji);

      await api.sendDocument(chatId, new InputFile(Buffer.from(content), filename), {
        caption,
        reply_markup: keyboard,
      });
      return;
    } catch (error) {
      logger.warn({ error, planPath, sessionId: session.id }, 'Failed to read plan file');
    }
  }

  // Fallback: no plan file found, send text with keyboard
  await api.sendMessage(chatId, postfixEmoji('📋 Plan ready for review', session.emoji), {
    reply_markup: keyboard,
  });
}
