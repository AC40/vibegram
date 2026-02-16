import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { buildSessionListKeyboard } from '../telegram/keyboard-builder.js';

export async function sessionsCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const sessions = sessionManager.getSessions(userId);
  if (sessions.length === 0) {
    await ctx.reply('No sessions. Use /new to create one.');
    return;
  }

  const activeId = sessionManager.getActiveSessionId(userId);
  const keyboard = buildSessionListKeyboard(sessions, activeId);

  const lines = sessions.map((s) => {
    const active = s.id === activeId ? ' ← active' : '';
    return `${s.emoji} ${s.name} [${s.backend}] (${s.status})${active}`;
  });

  await ctx.reply(`Sessions:\n${lines.join('\n')}`, {
    reply_markup: keyboard,
  });
}
