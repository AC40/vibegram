import { EventEmitter } from 'events';
import type { Attachment, ClaudeEvent } from './claude.js';

export interface AIBackend extends EventEmitter {
  readonly name: string;
  startSession(options: { cwd: string; permissionMode: string }): Promise<string>;
  sendMessage(sessionId: string, message: string, attachments?: Attachment[]): Promise<void>;
  abort(sessionId: string): Promise<void>;
  isProcessing(sessionId: string): boolean;
  destroySession(sessionId: string): Promise<void>;
}

export interface AIBackendEvents {
  event: [sessionId: string, event: ClaudeEvent];
}
