import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue } from '../core/message-queue.js';
import type { ClaudeBridge } from '../claude/claude-bridge.js';
import { logger } from '../utils/logger.js';

let claudeBridge: ClaudeBridge | null = null;

export function setClaudeBridge(bridge: ClaudeBridge): void {
  claudeBridge = bridge;
}

export async function handleTextMessage(ctx: BotContext, text: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  if (!claudeBridge) {
    await ctx.reply('Claude is not initialized yet.');
    return;
  }

  const queue = getQueue(session.id);

  if (queue.isProcessing) {
    const position = queue.enqueue({ text, timestamp: Date.now() });
    await ctx.reply(`⏳ Queued (position ${position}) ${session.emoji}`);
    return;
  }

  await sendToClaudeBridge(ctx, session, text);
}

async function sendToClaudeBridge(
  ctx: BotContext,
  session: ReturnType<typeof sessionManager.getActiveSession> & {},
  text: string,
): Promise<void> {
  if (!claudeBridge) return;

  const queue = getQueue(session.id);
  queue.setProcessing(true);
  sessionManager.updateSessionStatus(session.id, 'processing');

  // Set up the queue handler for follow-up messages
  queue.setHandler(async (msg) => {
    await sendToClaudeBridge(ctx, sessionManager.getActiveSession(ctx.from!.id)!, msg.text);
  });

  try {
    const options = {
      cwd: session.cwd,
      permissionMode: session.permissionMode,
      resume: session.claudeSessionId ?? undefined,
    };

    await claudeBridge.sendMessageWithOptions(session.id, text, options);
  } catch (error) {
    logger.error({ error, sessionId: session.id }, 'Failed to send message to Claude');
    queue.setProcessing(false);
    sessionManager.updateSessionStatus(session.id, 'idle');
    await ctx.reply(`❌ Failed to process message ${session.emoji}`);
  }
}
