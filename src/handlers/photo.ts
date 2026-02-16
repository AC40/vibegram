import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { sendSessionMessage } from '../core/message-dispatch.js';
import { downloadFile } from '../utils/telegram-helpers.js';
import { logger } from '../utils/logger.js';

export async function handlePhotoMessage(ctx: BotContext): Promise<void> {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  try {
    // Get highest resolution photo
    const photo = photos[photos.length - 1]!;
    const buffer = await downloadFile(ctx, photo.file_id);
    const caption = ctx.message?.caption ?? 'Analyze this image.';
    await sendSessionMessage(ctx, session, caption, [
      { type: 'image', data: buffer, mimeType: 'image/jpeg' },
    ]);
  } catch (error) {
    logger.error({ error }, 'Photo handling failed');
    await ctx.reply('Failed to process photo.');
  }
}
