export type ClaudeEvent =
  | { type: 'init'; sessionId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'text_done'; fullText: string }
  | { type: 'tool_use'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; output: string }
  | { type: 'result'; result: string; costUsd: number; durationMs: number; numTurns: number }
  | { type: 'error'; message: string }
  | { type: 'processing'; message: string };

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
