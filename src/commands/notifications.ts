import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { buildNotificationKeyboard } from '../telegram/keyboard-builder.js';

export async function notificationsCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const settings = sessionManager.getSettings(userId);
  const keyboard = buildNotificationKeyboard(settings.notificationMode);
  await ctx.reply(`Current notification mode: ${settings.notificationMode}`, {
    reply_markup: keyboard,
  });
}
