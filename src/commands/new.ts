import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { browseDirectory } from '../telegram/directory-browser.js';
import { setPendingNewSession } from '../handlers/callback-query.js';
import { buildBackendSelectionKeyboard } from '../telegram/keyboard-builder.js';
import type { BackendType } from '../types/session.js';

const BACKENDS = new Set<BackendType>(['codex', 'claude']);

export async function newCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const sessions = sessionManager.getSessions(userId);
  if (sessions.length >= 6) {
    await ctx.reply('Maximum 6 concurrent sessions. Delete one first with /delete.');
    return;
  }

  const text = ctx.message?.text ?? '';
  const rawInput = text.replace(/^\/new\s*/, '').trim();

  const settings = sessionManager.getSettings(userId);

  if (!rawInput) {
    const keyboard = buildBackendSelectionKeyboard();
    await ctx.reply('Choose backend for the new session:', { reply_markup: keyboard });
    return;
  }

  let backend: BackendType | undefined;
  let remaining = rawInput;
  const firstToken = rawInput.split(/\s+/)[0]?.toLowerCase();
  if (firstToken && BACKENDS.has(firstToken as BackendType)) {
    backend = firstToken as BackendType;
    remaining = rawInput.slice(firstToken.length).trim();
  }

  const selectedBackend = backend ?? settings.defaultBackend;

  // If there's a name with a path argument, use it directly
  if (remaining) {
    const parts = remaining.split(/\s+/);
    if (parts.length > 1) {
      const sessionName = parts[0]!;
      const path = parts.slice(1).join(' ');
      const session = sessionManager.createSession(userId, sessionName, path, selectedBackend);
      await ctx.reply(`Created ${session.emoji} ${session.name} [${session.backend}]\nDirectory: ${path}`);
      return;
    }
  }

  // Otherwise, open directory browser
  const pendingName = remaining || '';
  setPendingNewSession(userId, { name: pendingName, backend: selectedBackend });
  const { keyboard, resolvedPath } = browseDirectory(settings.defaultDirectory);
  const prompt = pendingName
    ? `📁 Select directory for "${pendingName}" (${selectedBackend})\n${resolvedPath}`
    : `📁 Select directory for new ${selectedBackend} session\n${resolvedPath}`;
  await ctx.reply(prompt, {
    reply_markup: keyboard,
  });
}
