import type { BotContext } from '../bot.js';
import * as sessionManager from './session-manager.js';
import { handleTextMessage } from '../handlers/text.js';
import { handleBashCommand } from '../handlers/bash.js';
import { logger } from '../utils/logger.js';

export async function routeMessage(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  // Commands are handled by grammY command handlers, not here
  if (text.startsWith('/')) return;

  // Bash commands
  if (text.startsWith('!')) {
    const command = text.slice(1).trim();
    if (command) {
      await handleBashCommand(ctx, command);
    }
    return;
  }

  // Plain text → active backend
  await handleTextMessage(ctx, text);
}
