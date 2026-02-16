export type BackendEvent =
  | { type: 'init'; sessionId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'text_done'; fullText: string }
  | { type: 'tool_use'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; output: string; exitCode?: number }
  | { type: 'result'; result: string; costUsd: number; durationMs: number; numTurns: number }
  | { type: 'error'; message: string }
  | { type: 'processing'; message: string };

// Backward compatible alias while the codebase transitions.
export type ClaudeEvent = BackendEvent;

export interface StreamingState {
  messageId: number | null;
  buffer: string;
  lastEditTime: number;
  messageCount: number;
}

export interface Attachment {
  readonly type: 'image' | 'document';
  readonly data: Buffer;
  readonly mimeType: string;
  readonly filename?: string;
}
