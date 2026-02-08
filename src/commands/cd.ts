import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { browseDirectory, isValidDirectory } from '../telegram/directory-browser.js';

export async function cdCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  const text = ctx.message?.text ?? '';
  const path = text.replace(/^\/cd\s*/, '').trim();

  if (path) {
    if (isValidDirectory(path)) {
      sessionManager.updateSessionCwd(session.id, path);
      await ctx.reply(`${session.emoji} Directory changed to: ${path}`);
    } else {
      await ctx.reply('Invalid directory path.');
    }
    return;
  }

  // Open directory browser at current cwd
  const { keyboard, resolvedPath } = browseDirectory(session.cwd);
  await ctx.reply(`📁 ${resolvedPath}`, { reply_markup: keyboard });
}
