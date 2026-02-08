import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { buildSessionDeleteKeyboard } from '../telegram/keyboard-builder.js';

export async function deleteCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const sessions = sessionManager.getSessions(userId);
  if (sessions.length === 0) {
    await ctx.reply('No sessions to delete.');
    return;
  }

  const keyboard = buildSessionDeleteKeyboard(sessions);
  await ctx.reply('Select a session to delete:', { reply_markup: keyboard });
}
