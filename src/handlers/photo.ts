import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import { downloadFile } from '../utils/telegram-helpers.js';
import type { ClaudeBridge } from '../claude/claude-bridge.js';
import { logger } from '../utils/logger.js';

let claudeBridge: ClaudeBridge | null = null;

export function setPhotoBridge(bridge: ClaudeBridge): void {
  claudeBridge = bridge;
}

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

  if (!claudeBridge) {
    await ctx.reply('Claude is not initialized yet.');
    return;
  }

  try {
    // Get highest resolution photo
    const photo = photos[photos.length - 1]!;
    const buffer = await downloadFile(ctx, photo.file_id);
    const caption = ctx.message?.caption ?? 'Analyze this image.';

    const queue = getQueue(session.id);
    if (queue.isProcessing) {
      const position = queue.enqueue({
        text: caption,
        attachments: [{ type: 'image', data: buffer, mimeType: 'image/jpeg' }],
        timestamp: Date.now(),
      });
      await ctx.reply(`⏳ Queued with image (position ${position}) ${session.emoji}`);
      return;
    }

    queue.setProcessing(true);
    sessionManager.updateSessionStatus(session.id, 'processing');

    // For images, we encode as base64 and include in the prompt
    const base64 = buffer.toString('base64');
    const imagePrompt = `[Image attached as base64: data:image/jpeg;base64,${base64}]\n\n${caption}`;

    const options = {
      cwd: session.cwd,
      permissionMode: session.permissionMode,
      resume: session.claudeSessionId ?? undefined,
    };

    await claudeBridge.sendMessageWithOptions(session.id, imagePrompt, options);
  } catch (error) {
    logger.error({ error }, 'Photo handling failed');
    await ctx.reply('Failed to process photo.');
  }
}
