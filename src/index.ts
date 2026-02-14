import { bot } from './bot.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { registerCommands } from './commands/index.js';
import { routeMessage } from './core/message-router.js';
import * as sessionManager from './core/session-manager.js';
import { handleCallbackQuery, setCallbackBridge } from './handlers/callback-query.js';
import { handleVoiceMessage } from './handlers/voice.js';
import { handlePhotoMessage, setPhotoBridge } from './handlers/photo.js';
import { handleDocumentMessage, setDocumentBridge } from './handlers/document.js';
import { setClaudeBridge } from './handlers/text.js';
import { setCancelBridge } from './commands/cancel.js';
import { setQueryStatusBridge } from './commands/querystatus.js';
import { ClaudeBridge } from './claude/claude-bridge.js';
import { routeClaudeEvent } from './claude/event-router.js';
import { getSessionById, getAllUserIds, cleanupInactiveSessions } from './db/session-repository.js';
import { startHttpServer, stopHttpServer } from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import type { ClaudeEvent } from './types/claude.js';

async function main(): Promise<void> {
  // Initialize database
  initDatabase();

  // Cleanup inactive sessions on startup
  const cleanedUp = cleanupInactiveSessions();
  if (cleanedUp > 0) {
    logger.info({ count: cleanedUp }, 'Cleaned up inactive sessions');
  }

  // Reload all user sessions from database into memory
  // This ensures existing sessions are active after bot restart
  const userIds = getAllUserIds();
  for (const userId of userIds) {
    sessionManager.initializeUserSessions(userId);
    logger.info({ userId }, 'Reloaded sessions for user');
  }

  // Start HTTP server (for health checks and/or webhook mode)
  // This runs on port 4020 (same as VibeTunnel) for ngrok compatibility
  await startHttpServer(bot);

  // Initialize Claude bridge
  const claudeBridge = new ClaudeBridge();

  // Wire Claude bridge to handlers
  setClaudeBridge(claudeBridge);
  setCallbackBridge(claudeBridge);
  setPhotoBridge(claudeBridge);
  setDocumentBridge(claudeBridge);
  setCancelBridge(claudeBridge);
  setQueryStatusBridge(claudeBridge);

  // Route Claude events to Telegram (chatId === userId in DMs)
  claudeBridge.on('event', async (sessionId: string, event: ClaudeEvent) => {
    try {
      const session = getSessionById(sessionId);
      if (!session) {
        logger.warn({ sessionId }, 'Received event for unknown session');
        return;
      }
      await routeClaudeEvent(bot.api, session.userId, session, event);
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to route Claude event');
    }
  });

  // Register bot commands
  registerCommands(bot);

  // Register message handlers
  bot.on('message:text', routeMessage);
  bot.on('message:voice', handleVoiceMessage);
  bot.on('message:photo', handlePhotoMessage);
  bot.on('message:document', handleDocumentMessage);
  bot.on('callback_query:data', handleCallbackQuery);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await bot.stop();
    await stopHttpServer();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start bot (polling or webhook mode)
  logger.info('Starting Vibegram bot...');
  if (config.USE_WEBHOOK) {
    // In webhook mode, Telegram sends updates via HTTP POST to our server
    // We don't need to start polling
    logger.info({ mode: 'webhook', port: config.PORT }, 'Bot started in webhook mode');
    // Keep the process alive
    await new Promise(() => {});
  } else {
    // Polling mode (default) - bot actively fetches updates from Telegram
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
