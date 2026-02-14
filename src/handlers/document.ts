import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import { downloadFile, FileTooLargeError } from '../utils/telegram-helpers.js';
import type { ClaudeBridge } from '../claude/claude-bridge.js';
import { logger } from '../utils/logger.js';

let claudeBridge: ClaudeBridge | null = null;

export function setDocumentBridge(bridge: ClaudeBridge): void {
  claudeBridge = bridge;
}

export async function handleDocumentMessage(ctx: BotContext): Promise<void> {
  const document = ctx.message?.document;
  if (!document) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  if (!claudeBridge) {
    await ctx.reply('Claude is not initialized yet.');
    return;
  }

  try {
    const buffer = await downloadFile(ctx, document.file_id);
    const filename = document.file_name ?? 'document';
    const caption = ctx.message?.caption ?? `Review this file: ${filename}`;

    const queue = getQueue(session.id);
    if (queue.isProcessing) {
      const position = queue.enqueue({
        text: caption,
        attachments: [{ type: 'document', data: buffer, mimeType: document.mime_type ?? 'application/octet-stream', filename }],
        timestamp: Date.now(),
      });
      await ctx.reply(`⏳ Queued with document (position ${position}) ${session.emoji}`);
      return;
    }

    queue.setProcessing(true);
    sessionManager.updateSessionStatus(session.id, 'processing');

    // For text-based documents, include content inline
    const isText = (document.mime_type ?? '').startsWith('text/') ||
      /\.(ts|js|py|md|json|yaml|yml|toml|xml|html|css|sh|bash|txt|log|csv|sql|rs|go|java|c|cpp|h|hpp|rb|php)$/i.test(filename);

    let prompt: string;
    if (isText) {
      const content = buffer.toString('utf-8');
      prompt = `File: ${filename}\n\`\`\`\n${content}\n\`\`\`\n\n${caption}`;
    } else {
      prompt = `[Binary document attached: ${filename}, ${buffer.length} bytes, type: ${document.mime_type ?? 'unknown'}]\n\n${caption}`;
    }

    const options = {
      cwd: session.cwd,
      permissionMode: session.permissionMode,
      resume: session.claudeSessionId ?? undefined,
    };

    await claudeBridge.sendMessageWithOptions(session.id, prompt, options);
  } catch (error) {
    if (error instanceof FileTooLargeError) {
      await ctx.reply(`❌ File too large: ${error.message}`);
      return;
    }
    logger.error({ error }, 'Document handling failed');
    await ctx.reply('Failed to process document.');
  }
}
