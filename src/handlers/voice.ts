import type { BotContext } from '../bot.js';
import { transcribeVoice } from '../services/deepgram.js';
import { handleTextMessage } from './text.js';
import { downloadFile } from '../utils/telegram-helpers.js';
import { logger } from '../utils/logger.js';

export async function handleVoiceMessage(ctx: BotContext): Promise<void> {
  const voice = ctx.message?.voice;
  if (!voice) return;

  try {
    await ctx.reply('🎤 Transcribing...');
    const buffer = await downloadFile(ctx, voice.file_id);
    const text = await transcribeVoice(buffer);

    if (!text) {
      await ctx.reply('Could not transcribe voice message.');
      return;
    }

    await ctx.reply(`🎤 "${text}"`);
    await handleTextMessage(ctx, text);
  } catch (error) {
    logger.error({ error }, 'Voice transcription failed');
    await ctx.reply('Failed to transcribe voice message.');
  }
}
