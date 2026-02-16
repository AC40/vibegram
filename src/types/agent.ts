import { EventEmitter } from 'events';
import type { Attachment, BackendEvent } from './claude.js';

export interface SendMessageOptions {
  readonly cwd?: string;
  readonly mode?: string;
  readonly resume?: string;
}

export interface AIBackend extends EventEmitter {
  readonly name: string;
  startSession(options: { cwd: string; mode: string }): Promise<string>;
  sendMessage(sessionId: string, message: string, attachments?: Attachment[]): Promise<void>;
  sendMessageWithOptions(
    sessionId: string,
    message: string,
    options: SendMessageOptions,
    attachments?: Attachment[],
  ): Promise<void>;
  abort(sessionId: string): Promise<void>;
  isProcessing(sessionId: string): boolean;
  destroySession(sessionId: string): Promise<void>;
}

export interface AIBackendEvents {
  event: [sessionId: string, event: BackendEvent];
}
