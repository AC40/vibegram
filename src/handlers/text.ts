import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { sendSessionMessage } from '../core/message-dispatch.js';
import { checkRateLimit } from '../core/rate-limiter.js';

export async function handleTextMessage(ctx: BotContext, text: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.allowed) {
    const resetSecs = Math.ceil(rateLimit.resetInMs / 1000);
    await ctx.reply(`⏱️ Rate limit exceeded. Try again in ${resetSecs}s.`);
    return;
  }

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  await sendSessionMessage(ctx, session, text);
}
