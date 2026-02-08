import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';

export async function startCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  sessionManager.initializeUserSessions(userId);
  const sessions = sessionManager.getSessions(userId);

  if (sessions.length === 0) {
    const settings = sessionManager.getSettings(userId);
    const session = sessionManager.createSession(userId, 'default', settings.defaultDirectory);

    await ctx.reply(
      `Welcome to Vibegram! ${session.emoji}\n\n` +
      `Created session "${session.name}" at ${session.cwd}\n\n` +
      `Just type a message to talk to Claude, or use:\n` +
      `/new [name] — Create a new session\n` +
      `/sessions — List all sessions\n` +
      `/cd — Change directory\n` +
      `/bothelp — Full command list\n` +
      `!command — Run bash commands\n`
    );
  } else {
    sessionManager.initializeUserSessions(userId);
    const active = sessionManager.getActiveSession(userId);
    await ctx.reply(
      `Welcome back! You have ${sessions.length} session(s).\n` +
      `Active: ${active?.emoji} ${active?.name} (${active?.cwd})\n\n` +
      `Type a message to talk to Claude.`
    );
  }
}
