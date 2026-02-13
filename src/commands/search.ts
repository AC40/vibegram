import type { BotContext } from '../bot.js';
import * as historyRepo from '../db/history-repository.js';

export async function searchCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const query = (ctx.match as string)?.trim();
  if (!query) {
    await ctx.reply('Usage: /search <query>\n\nSearch across all your session conversations.');
    return;
  }

  try {
    const results = historyRepo.searchConversations(userId, query, 10);

    if (results.length === 0) {
      await ctx.reply(`🔍 No results for "${query}"`);
      return;
    }

    const formatted = results.map((r) => {
      const prefix = r.turnType === 'user' ? '👤' : '🤖';
      const session = `${r.sessionEmoji} ${r.sessionName}`;
      const time = formatSearchTime(r.createdAt);
      return `${prefix} ${session} (${time})\n${r.snippet}`;
    }).join('\n\n---\n\n');

    await ctx.reply(`🔍 Results for "${query}":\n\n${formatted}`);
  } catch (error) {
    // FTS syntax errors (e.g., unbalanced quotes)
    await ctx.reply(`Search error. Try simpler terms without special characters.`);
  }
}

function formatSearchTime(isoString: string): string {
  const date = new Date(isoString + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
