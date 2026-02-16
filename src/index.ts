import { bot } from './bot.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { registerCommands } from './commands/index.js';
import { routeMessage } from './core/message-router.js';
import * as sessionManager from './core/session-manager.js';
import { handleCallbackQuery } from './handlers/callback-query.js';
import { handleVoiceMessage } from './handlers/voice.js';
import { handlePhotoMessage } from './handlers/photo.js';
import { handleDocumentMessage } from './handlers/document.js';
import { ClaudeBridge } from './claude/claude-bridge.js';
import { CodexBridge } from './codex/codex-bridge.js';
import { routeBackendEvent } from './claude/event-router.js';
import { getSessionById, getAllUserIds, cleanupInactiveSessions } from './db/session-repository.js';
import { registerBackends } from './core/backend-factory.js';
import { startHttpServer, stopHttpServer } from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import type { BackendEvent } from './types/claude.js';

async function main(): Promise<void> {
  initDatabase();

  const cleanedUp = cleanupInactiveSessions();
  if (cleanedUp > 0) {
    logger.info({ count: cleanedUp }, 'Cleaned up inactive sessions');
  }

  const userIds = getAllUserIds();
  for (const userId of userIds) {
    sessionManager.initializeUserSessions(userId);
    logger.info({ userId }, 'Reloaded sessions for user');
  }

  await startHttpServer(bot);

  const claudeBridge = new ClaudeBridge();
  const codexBridge = new CodexBridge();
  registerBackends({ claude: claudeBridge, codex: codexBridge });

  const routeEvent = async (sessionId: string, event: BackendEvent): Promise<void> => {
    try {
      const session = getSessionById(sessionId);
      if (!session) {
        logger.warn({ sessionId }, 'Received event for unknown session');
        return;
      }
      await routeBackendEvent(bot.api, session.userId, session, event);
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to route backend event');
    }
  };

  claudeBridge.on('event', routeEvent);
  codexBridge.on('event', routeEvent);

  registerCommands(bot);

  bot.on('message:text', routeMessage);
  bot.on('message:voice', handleVoiceMessage);
  bot.on('message:photo', handlePhotoMessage);
  bot.on('message:document', handleDocumentMessage);
  bot.on('callback_query:data', handleCallbackQuery);

  const shutdown = async () => {
    logger.info('Shutting down...');
    await bot.stop();
    await stopHttpServer();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Starting Vibegram bot...');
  if (config.USE_WEBHOOK) {
    logger.info({ mode: 'webhook', port: config.PORT }, 'Bot started in webhook mode');
    await new Promise(() => {});
  } else {
    await bot.start({
      onStart: (botInfo) => {
        logger.info({ username: botInfo.username }, 'Bot started in polling mode');
      },
    });
  }
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start bot');
  process.exit(1);
});
