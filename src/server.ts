import express from 'express';
import type { Bot } from 'grammy';
import type { BotContext } from './bot.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

let server: ReturnType<typeof express.application.listen> | null = null;

/**
 * Start the HTTP server for webhook mode or health checks
 * Runs on the same port as VibeTunnel (4020 by default)
 */
export async function startHttpServer(bot: Bot<BotContext>): Promise<void> {
  const app = express();

  // Health check endpoint (for systemd and ngrok)
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'vibegram',
      mode: config.USE_WEBHOOK ? 'webhook' : 'polling',
      timestamp: new Date().toISOString(),
    });
  });

  // Root endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: 'VibeGram',
      description: 'Telegram bot for Claude Code sessions',
      mode: config.USE_WEBHOOK ? 'webhook' : 'polling',
      health: '/health',
    });
  });

  // Webhook endpoint (only used in webhook mode)
  if (config.USE_WEBHOOK) {
    app.use(express.json());
    app.post(config.WEBHOOK_PATH, (req, res) => {
      // Handle webhook update
      bot.handleUpdate(req.body);
      res.status(200).send('OK');
    });

    // Set webhook URL if provided
    if (config.WEBHOOK_URL) {
      await bot.api.setWebhook(config.WEBHOOK_URL + config.WEBHOOK_PATH);
      logger.info({ webhookUrl: config.WEBHOOK_URL + config.WEBHOOK_PATH }, 'Webhook set');
    }
  }

  // Start server
  return new Promise((resolve, reject) => {
    server = app.listen(config.PORT, config.BIND, () => {
      logger.info(
        { port: config.PORT, bind: config.BIND, mode: config.USE_WEBHOOK ? 'webhook' : 'polling' },
        'HTTP server started'
      );
      resolve();
    });

    server.on('error', (error) => {
      logger.error({ error }, 'Failed to start HTTP server');
      reject(error);
    });
  });
}

/**
 * Stop the HTTP server
 */
export async function stopHttpServer(): Promise<void> {
  if (!server) {
    return;
  }

  return new Promise((resolve) => {
    server!.close(() => {
      logger.info('HTTP server stopped');
      resolve();
    });
  });
}

/**
 * Get the server instance
 */
export function getServer(): typeof server {
  return server;
}
