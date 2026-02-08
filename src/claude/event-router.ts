import type { Api } from 'grammy';
import type { ClaudeEvent } from '../types/claude.js';
import type { Session, UserSettings } from '../types/session.js';
import { StreamingEditor } from '../telegram/streaming-editor.js';
import { postfixEmoji } from '../telegram/renderer.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import { logger } from '../utils/logger.js';

const streamingEditors = new Map<string, StreamingEditor>();

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

export async function routeClaudeEvent(
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
      break;
    }

    case 'text_done': {
      // Finalize any streaming editor
      const editor = streamingEditors.get(session.id);
      if (editor) {
        await editor.finalize(disableNotification);
        streamingEditors.delete(session.id);
      }
      break;
    }

    case 'tool_use': {
      if (settings.verbosity !== 'minimal') {
        const toolMsg = `🔧 ${event.toolName}`;
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

      if (settings.verbosity !== 'minimal') {
        const costStr = `$${event.costUsd.toFixed(4)}`;
        const durationStr = `${(event.durationMs / 1000).toFixed(1)}s`;
        const summary = `✅ Done (${durationStr}, ${costStr}, ${event.numTurns} turns)`;
        await api.sendMessage(chatId, postfixEmoji(summary, session.emoji), {
          disable_notification: disableNotification,
        });
      }

      sessionManager.updateSessionStatus(session.id, 'idle');

      // Process next queued message
      const queue = getQueue(session.id);
      queue.setProcessing(false);
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
