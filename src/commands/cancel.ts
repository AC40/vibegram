import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import { getBackendForSession } from '../core/backend-factory.js';

export async function cancelCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session.');
    return;
  }

  const queue = getQueue(session.id);
  const cleared = queue.clear();
  queue.setProcessing(false);

  await getBackendForSession(session).abort(session.id);

  sessionManager.updateSessionStatus(session.id, 'idle');

  const parts = ['Cancelled.'];
  if (cleared.length > 0) {
    parts.push(`Cleared ${cleared.length} queued message(s).`);
  }

  await ctx.reply(`${session.emoji} ${parts.join(' ')}`);
}
