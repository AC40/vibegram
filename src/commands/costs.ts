import type { BotContext } from '../bot.js';
import * as sessionRepo from '../db/session-repository.js';

export async function costsCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const totalCost = sessionRepo.getUserTotalCost(userId);
  const costBySession = sessionRepo.getUserCostBySession(userId);

  if (costBySession.length === 0) {
    await ctx.reply('No sessions found.');
    return;
  }

  const sessionLines = costBySession
    .filter(s => s.cost > 0)
    .map(s => `  ${s.emoji} ${s.sessionName}: $${s.cost.toFixed(4)}`);

  const message = [
    `💰 API Cost Summary`,
    ``,
    `Total: $${totalCost.toFixed(4)}`,
    ``,
    sessionLines.length > 0 ? `By session:\n${sessionLines.join('\n')}` : 'No costs recorded yet.',
  ].join('\n');

  await ctx.reply(message);
}
