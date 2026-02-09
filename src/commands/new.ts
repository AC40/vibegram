import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { browseDirectory } from '../telegram/directory-browser.js';
import { setPendingNewSession } from '../handlers/callback-query.js';

export async function newCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const sessions = sessionManager.getSessions(userId);
  if (sessions.length >= 6) {
    await ctx.reply('Maximum 6 concurrent sessions. Delete one first with /delete.');
    return;
  }

  const text = ctx.message?.text ?? '';
  const rawName = text.replace(/^\/new\s*/, '').trim();

  const settings = sessionManager.getSettings(userId);

  // If there's a name with a path argument, use it directly
  if (rawName) {
    const parts = rawName.split(/\s+/);
    if (parts.length > 1) {
      const sessionName = parts[0]!;
      const path = parts.slice(1).join(' ');
      const session = sessionManager.createSession(userId, sessionName, path);
      await ctx.reply(`Created ${session.emoji} ${session.name}\nDirectory: ${path}`);
      return;
    }
  }

  // Otherwise, open directory browser
  const pendingName = rawName || '';
  setPendingNewSession(userId, pendingName);
  const { keyboard, resolvedPath } = browseDirectory(settings.defaultDirectory);
  const prompt = pendingName
    ? `📁 Select directory for "${pendingName}"\n${resolvedPath}`
    : `📁 Select directory for new session\n${resolvedPath}`;
  await ctx.reply(prompt, {
    reply_markup: keyboard,
  });
}
