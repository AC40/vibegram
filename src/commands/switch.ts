import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { buildSessionListKeyboard } from '../telegram/keyboard-builder.js';

export async function switchCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const sessions = sessionManager.getSessions(userId);
  if (sessions.length <= 1) {
    await ctx.reply('Only one session exists. Use /new to create another.');
    return;
  }

  const activeId = sessionManager.getActiveSessionId(userId);
  const keyboard = buildSessionListKeyboard(sessions, activeId);
  await ctx.reply('Select a session:', { reply_markup: keyboard });
}
