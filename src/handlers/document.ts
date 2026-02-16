import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { sendSessionMessage } from '../core/message-dispatch.js';
import { downloadFile, FileTooLargeError } from '../utils/telegram-helpers.js';
import { logger } from '../utils/logger.js';

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

  try {
    const buffer = await downloadFile(ctx, document.file_id);
    const filename = document.file_name ?? 'document';
    const caption = ctx.message?.caption ?? `Review this file: ${filename}`;
    await sendSessionMessage(ctx, session, caption, [
      {
        type: 'document',
        data: buffer,
        mimeType: document.mime_type ?? 'application/octet-stream',
        filename,
      },
    ]);
  } catch (error) {
    if (error instanceof FileTooLargeError) {
      await ctx.reply(`❌ File too large: ${error.message}`);
      return;
    }
    logger.error({ error }, 'Document handling failed');
    await ctx.reply('Failed to process document.');
  }
}
