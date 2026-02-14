import type { BotContext } from '../bot.js';
import * as sessionManager from '../core/session-manager.js';
import { getQueue, type QueuedMessage } from '../core/message-queue.js';
import { checkRateLimit } from '../core/rate-limiter.js';
import type { ClaudeBridge } from '../claude/claude-bridge.js';
import { logger } from '../utils/logger.js';
import * as historyRepo from '../db/history-repository.js';
import type { Attachment } from '../types/claude.js';

let claudeBridge: ClaudeBridge | null = null;

export function setClaudeBridge(bridge: ClaudeBridge): void {
  claudeBridge = bridge;
}

export async function handleTextMessage(ctx: BotContext, text: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Rate limiting
  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.allowed) {
    const resetSecs = Math.ceil(rateLimit.resetInMs / 1000);
    await ctx.reply(`⏱️ Rate limit exceeded. Try again in ${resetSecs}s.`);
    return;
  }

  const session = sessionManager.getActiveSession(userId);
  if (!session) {
    await ctx.reply('No active session. Use /new to create one.');
    return;
  }

  if (!claudeBridge) {
    await ctx.reply('Claude is not initialized yet.');
    return;
  }

  const queue = getQueue(session.id);

  if (queue.isProcessing) {
    const position = queue.enqueue({ text, timestamp: Date.now() });
    await ctx.reply(`⏳ Queued (position ${position}) ${session.emoji}`);
    return;
  }

  await sendToClaudeBridge(ctx, session, { text, timestamp: Date.now() });
}

async function sendToClaudeBridge(
  ctx: BotContext,
  session: ReturnType<typeof sessionManager.getActiveSession> & {},
  message: QueuedMessage,
): Promise<void> {
  if (!claudeBridge) return;

  const queue = getQueue(session.id);
  queue.setProcessing(true);
  sessionManager.updateSessionStatus(session.id, 'processing');

  // Set up the queue handler for follow-up messages (including attachments)
  queue.setHandler(async (msg) => {
    const currentSession = sessionManager.getActiveSession(ctx.from!.id);
    if (currentSession) {
      await sendToClaudeBridge(ctx, currentSession, msg);
    }
  });

  try {
    // Build prompt with attachments
    const prompt = buildPromptWithAttachments(message.text, message.attachments);

    // Persist user message to history
    const userTurn = historyRepo.addUserTurn(session.id, prompt);
    queue.setCurrentTurnId(userTurn.id);

    const options = {
      cwd: session.cwd,
      permissionMode: session.permissionMode,
      resume: session.claudeSessionId ?? undefined,
    };

    await claudeBridge.sendMessageWithOptions(session.id, prompt, options);
  } catch (error) {
    logger.error({ error, sessionId: session.id }, 'Failed to send message to Claude');
    queue.setProcessing(false);
    sessionManager.updateSessionStatus(session.id, 'idle');
    await ctx.reply(`❌ Failed to process message ${session.emoji}`);
  }
}

/**
 * Build a prompt that includes attachment content
 */
function buildPromptWithAttachments(text: string, attachments?: Attachment[]): string {
  if (!attachments || attachments.length === 0) {
    return text;
  }

  const attachmentParts: string[] = [];

  for (const attachment of attachments) {
    if (attachment.type === 'image') {
      const base64 = attachment.data.toString('base64');
      attachmentParts.push(`[Image: ${attachment.mimeType}, ${attachment.data.length} bytes]\nBase64: ${base64.slice(0, 100)}...`);
    } else if (attachment.type === 'document') {
      const isText = attachment.mimeType.startsWith('text/') ||
        /\.(ts|js|py|md|json|yaml|yml|toml|xml|html|css|sh|bash|txt|log|csv|sql|rs|go|java|c|cpp|h|hpp|rb|php)$/i.test(attachment.filename ?? '');

      if (isText) {
        const content = attachment.data.toString('utf-8');
        attachmentParts.push(`File: ${attachment.filename ?? 'document'}\n\`\`\`\n${content}\n\`\`\``);
      } else {
        attachmentParts.push(`[Binary: ${attachment.filename ?? 'document'}, ${attachment.data.length} bytes, ${attachment.mimeType}]`);
      }
    }
  }

  return attachmentParts.length > 0
    ? `${attachmentParts.join('\n\n')}\n\n${text}`
    : text;
}
