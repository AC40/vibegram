import { bot } from './bot.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { registerCommands } from './commands/index.js';
import { routeMessage } from './core/message-router.js';
import { handleCallbackQuery, setCallbackBridge } from './handlers/callback-query.js';
import { handleVoiceMessage } from './handlers/voice.js';
import { handlePhotoMessage, setPhotoBridge } from './handlers/photo.js';
import { handleDocumentMessage, setDocumentBridge } from './handlers/document.js';
import { setClaudeBridge } from './handlers/text.js';
import { setCancelBridge } from './commands/cancel.js';
import { setQueryStatusBridge } from './commands/querystatus.js';
import { ClaudeBridge } from './claude/claude-bridge.js';
import { routeClaudeEvent } from './claude/event-router.js';
import { getSessionById } from './db/session-repository.js';
import { logger } from './utils/logger.js';
import type { ClaudeEvent } from './types/claude.js';

async function main(): Promise<void> {
  // Initialize database
  initDatabase();

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
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start polling
  logger.info('Starting Vibegram bot...');
  await bot.start({
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, 'Bot started');
    },
  });
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start bot');
  process.exit(1);
});
