import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { buildPermissionModeKeyboard } from '../telegram/keyboard-builder.js';

export async function modeCommand(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session.');
    return;
  }

  const text = ctx.message?.text ?? '';
  const mode = text.replace(/^\/mode\s*/, '').trim();

  if (mode && ['default', 'acceptEdits', 'plan', 'dontAsk'].includes(mode)) {
    sessionManager.updateSessionPermissionMode(session.id, mode);
    await ctx.reply(`${session.emoji} Permission mode set to: ${mode}`);
    return;
  }

  const keyboard = buildPermissionModeKeyboard();
  await ctx.reply(`${session.emoji} Current mode: ${session.permissionMode}\nSelect permission mode:`, {
    reply_markup: keyboard,
  });
}
