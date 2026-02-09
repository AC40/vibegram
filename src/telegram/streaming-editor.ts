import type { Api } from 'grammy';
import { chunkText, SAFE_LIMIT } from './chunker.js';
import { renderMarkdown, postfixEmoji } from './renderer.js';
import { logger } from '../utils/logger.js';

const EDIT_INTERVAL_MS = 1000;

export class StreamingEditor {
  private messageId: number | null = null;
  private buffer = '';
  private lastEditTime = 0;
  private editTimer: ReturnType<typeof setTimeout> | null = null;
  private messageCount = 0;
  private finalized = false;

  constructor(
    private readonly api: Api,
    private readonly chatId: number,
    private readonly emoji: string,
  ) {}

  async appendText(text: string): Promise<void> {
    if (this.finalized) return;
    this.buffer += text;

    // If buffer exceeds safe limit, finalize current and start new message
    if (this.buffer.length > SAFE_LIMIT && this.messageId) {
      await this.finalizeCurrentMessage();
      this.messageId = null;
      this.buffer = text; // Keep overflow text for new message
    }

    await this.scheduleEdit();
  }

  private async scheduleEdit(): Promise<void> {
    const now = Date.now();
    if (now - this.lastEditTime < EDIT_INTERVAL_MS) {
      if (!this.editTimer) {
        this.editTimer = setTimeout(() => {
          this.editTimer = null;
          this.flushEdit();
        }, EDIT_INTERVAL_MS - (now - this.lastEditTime));
      }
      return;
    }
    await this.flushEdit();
  }

  private async flushEdit(): Promise<void> {
    if (this.finalized || !this.buffer) return;

    const displayText = postfixEmoji(this.buffer, this.emoji);

    try {
      if (!this.messageId) {
        const msg = await this.api.sendMessage(this.chatId, displayText, {
          disable_notification: true,
        });
        this.messageId = msg.message_id;
        this.messageCount++;
      } else {
        await this.api.editMessageText(this.chatId, this.messageId, displayText);
      }
      this.lastEditTime = Date.now();
    } catch (error: unknown) {
      // Telegram may reject edits if content unchanged
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('message is not modified')) {
        logger.warn({ error }, 'Failed to edit streaming message');
      }
    }
  }

  private async finalizeCurrentMessage(): Promise<void> {
    if (this.editTimer) {
      clearTimeout(this.editTimer);
      this.editTimer = null;
    }

    if (this.messageId) {
      const rendered = postfixEmoji(renderMarkdown(this.buffer), this.emoji);
      try {
        await this.api.editMessageText(this.chatId, this.messageId, rendered, {
          parse_mode: 'MarkdownV2',
        });
      } catch {
        // Fallback: plain text without parse_mode
        const plain = postfixEmoji(this.buffer, this.emoji);
        try {
          await this.api.editMessageText(this.chatId, this.messageId, plain);
        } catch {
          // Best effort
        }
      }
    }
  }

  async finalize(disableNotification: boolean = true): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    if (this.editTimer) {
      clearTimeout(this.editTimer);
      this.editTimer = null;
    }

    if (!this.buffer) return;

    const rendered = postfixEmoji(renderMarkdown(this.buffer), this.emoji);

    try {
      if (!this.messageId) {
        await this.api.sendMessage(this.chatId, rendered, {
          parse_mode: 'MarkdownV2',
          disable_notification: disableNotification,
        });
      } else {
        await this.api.editMessageText(this.chatId, this.messageId, rendered, {
          parse_mode: 'MarkdownV2',
        });
      }
    } catch (error: unknown) {
      // Fallback: retry as plain text (malformed Markdown, etc.)
      const plain = postfixEmoji(this.buffer, this.emoji);
      try {
        if (!this.messageId) {
          await this.api.sendMessage(this.chatId, plain, {
            disable_notification: disableNotification,
          });
        } else {
          await this.api.editMessageText(this.chatId, this.messageId, plain);
        }
      } catch (fallbackError: unknown) {
        const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        if (!msg.includes('message is not modified')) {
          logger.warn({ error: fallbackError }, 'Failed to finalize streaming message');
        }
      }
    }
  }

  get totalMessages(): number {
    return this.messageCount;
  }
}
