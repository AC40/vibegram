import type { Context, NextFunction } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  if (config.ALLOWED_USER_IDS.length > 0 && !config.ALLOWED_USER_IDS.includes(userId)) {
    logger.warn({ userId }, 'Unauthorized access attempt');
    await ctx.reply('You are not authorized to use this bot.');
    return;
  }

  await next();
}

export function isAuthorized(userId: number): boolean {
  return config.ALLOWED_USER_IDS.length === 0 || config.ALLOWED_USER_IDS.includes(userId);
}
