import { logger } from '../utils/logger.js';
import type { Attachment } from '../types/claude.js';

export interface QueuedMessage {
  readonly text: string;
  readonly attachments?: Attachment[];
  readonly timestamp: number;
}

type MessageHandler = (message: QueuedMessage) => Promise<void>;

class SessionQueue {
  private readonly queue: QueuedMessage[] = [];
  private processing = false;
  private handler: MessageHandler | null = null;
  private currentTurnId: number | null = null;

  setHandler(handler: MessageHandler): void {
    this.handler = handler;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  get depth(): number {
    return this.queue.length;
  }

  setCurrentTurnId(id: number | null): void {
    this.currentTurnId = id;
  }

  getCurrentTurnId(): number | null {
    return this.currentTurnId;
  }

  enqueue(message: QueuedMessage): number {
    this.queue.push(message);
    return this.queue.length;
  }

  async processNext(): Promise<boolean> {
    if (this.processing || this.queue.length === 0 || !this.handler) {
      return false;
    }

    const message = this.queue.shift()!;
    this.processing = true;

    try {
      await this.handler(message);
    } catch (error) {
      logger.error({ error }, 'Error processing queued message');
    } finally {
      this.processing = false;
    }

    return true;
  }

  clear(): QueuedMessage[] {
    const cleared = [...this.queue];
    this.queue.length = 0;
    return cleared;
  }

  setProcessing(value: boolean): void {
    this.processing = value;
  }
}

const queues = new Map<string, SessionQueue>();

export function getQueue(sessionId: string): SessionQueue {
  let queue = queues.get(sessionId);
  if (!queue) {
    queue = new SessionQueue();
    queues.set(sessionId, queue);
  }
  return queue;
}

export function destroyQueue(sessionId: string): void {
  queues.delete(sessionId);
}
