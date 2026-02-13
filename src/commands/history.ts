import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import * as historyRepo from '../db/history-repository.js';
import { buildHistoryPaginationKeyboard } from '../telegram/keyboard-builder.js';
import { postfixEmoji } from '../telegram/renderer.js';

const ITEMS_PER_PAGE = 5;

export async function historyCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  const total = historyRepo.getHistoryCount(session.id);
  if (total === 0) {
    await ctx.reply(postfixEmoji('No conversation history yet', session.emoji));
    return;
  }

  const turns = historyRepo.getHistory(session.id, ITEMS_PER_PAGE, 0);
  const formatted = formatHistoryPage(turns, 1, Math.ceil(total / ITEMS_PER_PAGE));

  await ctx.reply(postfixEmoji(formatted, session.emoji), {
    reply_markup: buildHistoryPaginationKeyboard(session.id, 0, total, ITEMS_PER_PAGE),
  });
}

export function formatHistoryPage(turns: historyRepo.ConversationTurn[], page: number, totalPages: number): string {
  const lines = turns.map((turn) => {
    const prefix = turn.turnType === 'user' ? '👤' : '🤖';
    const preview = turn.content.slice(0, 150).replace(/\n/g, ' ');
    const time = formatTime(turn.createdAt);
    const cost = turn.costUsd ? ` ($${turn.costUsd.toFixed(4)})` : '';
    return `${prefix} ${time}${cost}\n${preview}${turn.content.length > 150 ? '...' : ''}`;
  });

  return `📜 History (${page}/${totalPages})\n\n${lines.join('\n\n')}`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString + 'Z'); // SQLite stores UTC
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export { ITEMS_PER_PAGE };
