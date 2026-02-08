import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import type { ClaudeBridge } from '../claude/claude-bridge.js';

let claudeBridge: ClaudeBridge | null = null;

export function setQueryStatusBridge(bridge: ClaudeBridge): void {
  claudeBridge = bridge;
}

export async function querystatusCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session.');
    return;
  }

  const queue = getQueue(session.id);
  const processing = claudeBridge?.isProcessing(session.id) ?? false;

  const lines = [
    `${session.emoji} ${session.name}`,
    `Processing: ${processing ? 'yes' : 'no'}`,
    `Queue depth: ${queue.depth}`,
    `Status: ${session.status}`,
  ];

  await ctx.reply(lines.join('\n'));
}
