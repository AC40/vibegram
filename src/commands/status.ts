import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';

export async function statusCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  const lines = [
    `${session.emoji} *${session.name}*`,
    `Status: ${session.status}`,
    `Directory: ${session.cwd}`,
    `Mode: ${session.permissionMode}`,
    `Created: ${session.createdAt}`,
    `Last active: ${session.lastActiveAt}`,
    `Claude session: ${session.claudeSessionId ? 'active' : 'none'}`,
  ];

  await ctx.reply(lines.join('\n'));
}
