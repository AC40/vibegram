import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import { getBackendForSession } from '../core/backend-factory.js';

export async function querystatusCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session.');
    return;
  }

  const queue = getQueue(session.id);
  const processing = getBackendForSession(session).isProcessing(session.id);

  const lines = [
    `${session.emoji} ${session.name}`,
    `Backend: ${session.backend}`,
    `Processing: ${processing ? 'yes' : 'no'}`,
    `Queue depth: ${queue.depth}`,
    `Status: ${session.status}`,
  ];

  await ctx.reply(lines.join('\n'));
}
