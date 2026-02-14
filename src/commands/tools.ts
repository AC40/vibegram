import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import * as historyRepo from '../db/history-repository.js';
import { postfixEmoji } from '../telegram/renderer.js';
import { TOOL_INVOCATIONS_PAGE_SIZE } from '../constants.js';

export async function toolsCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  const invocations = historyRepo.getToolInvocations(session.id, TOOL_INVOCATIONS_PAGE_SIZE);

  if (invocations.length === 0) {
    await ctx.reply(postfixEmoji('No tool invocations yet', session.emoji));
    return;
  }

  const lines = invocations.map((inv) => {
    const time = formatTime(inv.createdAt);
    const detail = inv.filePath ? `: ${inv.filePath}` : '';
    return `🔧 ${inv.toolName}${detail}\n   ${time}`;
  });

  const message = `📋 Recent Tool Invocations\n\n${lines.join('\n\n')}`;
  await ctx.reply(postfixEmoji(message, session.emoji));
}

function formatTime(isoString: string): string {
  const date = new Date(isoString + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}
