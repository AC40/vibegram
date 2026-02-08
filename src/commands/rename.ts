import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';

export async function renameCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session.');
    return;
  }

  const text = ctx.message?.text ?? '';
  const newName = text.replace(/^\/rename\s*/, '').trim();

  if (!newName) {
    await ctx.reply(`Usage: /rename <new name>\nCurrent: ${session.emoji} ${session.name}`);
    return;
  }

  const oldName = session.name;
  sessionManager.renameSession(session.id, newName);
  await ctx.reply(`${session.emoji} Renamed "${oldName}" → "${newName}"`);
}
