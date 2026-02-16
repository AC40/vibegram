import type { BotContext } from '../bot.js';
import { getBackendForSession } from './backend-factory.js';
import { getQueue, type QueuedMessage } from './message-queue.js';
import * as sessionManager from './session-manager.js';
import type { Attachment } from '../types/claude.js';
import type { Session } from '../types/session.js';
import { logger } from '../utils/logger.js';

function formatQueuedReply(session: Session, attachments: Attachment[] | undefined, position: number): string {
  if (!attachments || attachments.length === 0) {
    return `⏳ Queued (position ${position}) ${session.emoji}`;
  }

  const hasImage = attachments.some((attachment) => attachment.type === 'image');
  const hasDoc = attachments.some((attachment) => attachment.type === 'document');
  if (hasImage && hasDoc) {
    return `⏳ Queued with attachments (position ${position}) ${session.emoji}`;
  }
  if (hasImage) {
    return `⏳ Queued with image (position ${position}) ${session.emoji}`;
  }
  return `⏳ Queued with document (position ${position}) ${session.emoji}`;
}

async function dispatchMessage(session: Session, message: QueuedMessage): Promise<void> {
  const backend = getBackendForSession(session);
  await backend.sendMessageWithOptions(
    session.id,
    message.text,
    {
      cwd: session.cwd,
      mode: session.permissionMode,
      resume: session.backendSessionId ?? undefined,
    },
    message.attachments,
  );
}

export async function sendSessionMessage(
  ctx: BotContext,
  session: Session,
  text: string,
  attachments?: Attachment[],
): Promise<void> {
  const queue = getQueue(session.id);
  const payload: QueuedMessage = { text, attachments, timestamp: Date.now() };

  queue.setHandler(async (message) => {
    const currentSession = sessionManager.getSessionById(session.id);
    if (!currentSession) {
      queue.setProcessing(false);
      return;
    }

    try {
      await dispatchMessage(currentSession, message);
    } catch (error) {
      logger.error({ error, sessionId: currentSession.id }, 'Failed to send queued message');
      queue.setProcessing(false);
      sessionManager.updateSessionStatus(currentSession.id, 'idle');
    }
  });

  if (queue.isProcessing) {
    const position = queue.enqueue(payload);
    await ctx.reply(formatQueuedReply(session, attachments, position));
    return;
  }

  queue.setProcessing(true);
  sessionManager.updateSessionStatus(session.id, 'processing');

  try {
    await dispatchMessage(session, payload);
  } catch (error) {
    logger.error({ error, sessionId: session.id, backend: session.backend }, 'Failed to dispatch message');
    queue.setProcessing(false);
    sessionManager.updateSessionStatus(session.id, 'idle');
    await ctx.reply(`❌ Failed to process message ${session.emoji}`);
  }
}
