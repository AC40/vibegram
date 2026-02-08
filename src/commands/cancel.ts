import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import type { ClaudeBridge } from '../claude/claude-bridge.js';

let claudeBridge: ClaudeBridge | null = null;

export function setCancelBridge(bridge: ClaudeBridge): void {
  claudeBridge = bridge;
}

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

  if (claudeBridge) {
    await claudeBridge.abort(session.id);
  }

  sessionManager.updateSessionStatus(session.id, 'idle');

  const parts = ['Cancelled.'];
  if (cleared.length > 0) {
    parts.push(`Cleared ${cleared.length} queued message(s).`);
  }

  await ctx.reply(`${session.emoji} ${parts.join(' ')}`);
}
