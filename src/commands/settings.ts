import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { buildSettingsKeyboard } from '../telegram/keyboard-builder.js';

export async function settingsCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const settings = sessionManager.getSettings(userId);
  const keyboard = buildSettingsKeyboard();

  await ctx.reply(
    `Settings:\n` +
    `Notifications: ${settings.notificationMode}\n` +
    `Verbosity: ${settings.verbosity}\n` +
    `Cross-session: ${settings.crossSessionVisibility}\n` +
    `Default backend: ${settings.defaultBackend}\n` +
    `Default Claude mode: ${settings.defaultPermissionMode}\n` +
    `Default Codex mode: ${settings.defaultCodexMode}`,
    { reply_markup: keyboard },
  );
}
