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
  const name = text.replace(/^\/new\s*/, '').trim() || `session-${sessions.length + 1}`;

  const settings = sessionManager.getSettings(userId);

  // If there's a path argument after the name, use it directly
  const parts = name.split(/\s+/);
  if (parts.length > 1) {
    const sessionName = parts[0]!;
    const path = parts.slice(1).join(' ');
    const session = sessionManager.createSession(userId, sessionName, path);
    await ctx.reply(`Created ${session.emoji} ${session.name}\nDirectory: ${path}`);
    return;
  }

  // Otherwise, open directory browser
  setPendingNewSession(userId, name);
  const { keyboard, resolvedPath } = browseDirectory(settings.defaultDirectory);
  await ctx.reply(`📁 Select directory for "${name}"\n${resolvedPath}`, {
    reply_markup: keyboard,
  });
}
