import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { buildVerbosityKeyboard } from '../telegram/keyboard-builder.js';

export async function verbosityCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const settings = sessionManager.getSettings(userId);
  const keyboard = buildVerbosityKeyboard(settings.verbosity);
  await ctx.reply(`Current verbosity: ${settings.verbosity}`, {
    reply_markup: keyboard,
  });
}
