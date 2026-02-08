import { Bot, Context, session, type SessionFlavor } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { config } from './config.js';
import { authMiddleware } from './core/auth.js';
import { logger } from './utils/logger.js';

export interface SessionData {
  activeSessionId: string | null;
}

export type BotContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

bot.api.config.use(autoRetry({
  maxRetryAttempts: 3,
  maxDelaySeconds: 10,
}));

bot.use(session({
  initial: (): SessionData => ({
    activeSessionId: null,
  }),
}));

bot.use(authMiddleware);

bot.catch((err) => {
  logger.error({ err: err.error, update: err.ctx.update }, 'Bot error');
});

export { bot };
