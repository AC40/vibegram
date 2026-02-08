import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';

export async function clearCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session.');
    return;
  }

  sessionManager.clearSession(session.id);
  await ctx.reply(`${session.emoji} Session cleared. Next message starts a fresh conversation.`);
}
