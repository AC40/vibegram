import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import type { AIBackend } from '../types/agent.js';
import type { ClaudeEvent, Attachment } from '../types/claude.js';
import { logger } from '../utils/logger.js';

export interface BridgeOptions {
  readonly cwd?: string;
  readonly permissionMode?: string;
  readonly resume?: string;
}

interface SessionState {
  process: ChildProcess | null;
  processing: boolean;
}

export class ClaudeBridge extends EventEmitter implements AIBackend {
  readonly name = 'claude';
  private readonly sessions = new Map<string, SessionState>();

  private getOrCreateState(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { process: null, processing: false };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  async startSession(_options: { cwd: string; permissionMode: string }): Promise<string> {
    const trackingId = crypto.randomUUID();
    this.getOrCreateState(trackingId);
    return trackingId;
  }

  async sendMessage(sessionId: string, message: string, _attachments?: Attachment[]): Promise<void> {
    await this.sendMessageWithOptions(sessionId, message, {});
  }

  async sendMessageWithOptions(
    sessionId: string,
    prompt: string,
    options: BridgeOptions,
  ): Promise<void> {
    const state = this.getOrCreateState(sessionId);
    if (state.processing) throw new Error('Session is already processing');

    state.processing = true;

    try {
      const args = [
        '-p', prompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--permission-mode', options.permissionMode ?? 'default',
        '--allowedTools', 'Read,Edit,Write,Bash,Glob,Grep,Task,WebFetch,WebSearch',
      ];

      if (options.resume) {
        args.push('--resume', options.resume);
      }

      logger.debug({ sessionId, cwd: options.cwd, resume: !!options.resume }, 'Spawning claude CLI');

      const child = spawn('claude', args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      state.process = child;

      const rl = createInterface({ input: child.stdout! });

      rl.on('line', (line) => {
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          this.processCliMessage(sessionId, msg);
        } catch {
          logger.debug({ sessionId, line }, 'Non-JSON line from claude CLI');
        }
      });

      let stderrChunks = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks += chunk.toString();
      });

      await new Promise<void>((resolve) => {
        child.on('close', (code) => {
          state.process = null;
          state.processing = false;

          if (code !== 0 && code !== null) {
            const errMsg = stderrChunks.trim() || `claude CLI exited with code ${code}`;
            logger.error({ sessionId, code, stderr: stderrChunks }, 'Claude CLI error');
            this.emit('event', sessionId, { type: 'error', message: errMsg } satisfies ClaudeEvent);
          }

          resolve();
        });

        child.on('error', (error) => {
          state.process = null;
          state.processing = false;
          logger.error({ sessionId, error: error.message }, 'Failed to spawn claude CLI');
          this.emit('event', sessionId, {
            type: 'error',
            message: `Failed to spawn claude: ${error.message}`,
          } satisfies ClaudeEvent);
          resolve();
        });
      });
    } finally {
      state.processing = false;
    }
  }

  private processCliMessage(sessionId: string, msg: Record<string, unknown>): void {
    const type = msg['type'] as string | undefined;

    switch (type) {
      case 'system': {
        const subtype = msg['subtype'] as string | undefined;
        if (subtype === 'init') {
          const claudeSessionId = msg['session_id'] as string | undefined;
          if (claudeSessionId) {
            this.emit('event', sessionId, {
              type: 'init',
              sessionId: claudeSessionId,
            } satisfies ClaudeEvent);
          }
        }
        break;
      }

      case 'assistant': {
        const message = msg['message'] as { content?: Array<Record<string, unknown>> } | undefined;
        const content = message?.content;
        if (!Array.isArray(content)) break;

        for (const block of content) {
          if (block['type'] === 'text' && typeof block['text'] === 'string') {
            this.emit('event', sessionId, {
              type: 'text_done',
              fullText: block['text'],
            } satisfies ClaudeEvent);
          } else if (block['type'] === 'tool_use') {
            this.emit('event', sessionId, {
              type: 'tool_use',
              toolName: block['name'] as string,
              input: (block['input'] ?? {}) as Record<string, unknown>,
            } satisfies ClaudeEvent);
          }
        }
        break;
      }

      case 'content_block_delta': {
        const delta = msg['delta'] as Record<string, unknown> | undefined;
        if (delta && typeof delta['text'] === 'string') {
          this.emit('event', sessionId, {
            type: 'text_delta',
            text: delta['text'],
          } satisfies ClaudeEvent);
        }
        break;
      }

      case 'result': {
        const subtype = msg['subtype'] as string | undefined;
        if (subtype === 'success') {
          this.emit('event', sessionId, {
            type: 'result',
            result: (msg['result'] as string) ?? '',
            costUsd: (msg['total_cost_usd'] as number) ?? 0,
            durationMs: (msg['duration_ms'] as number) ?? 0,
            numTurns: (msg['num_turns'] as number) ?? 0,
          } satisfies ClaudeEvent);
        } else {
          const errors = msg['errors'] as string[] | undefined;
          this.emit('event', sessionId, {
            type: 'error',
            message: `Query ended: ${subtype ?? 'unknown'}${errors ? ` - ${errors.join(', ')}` : ''}`,
          } satisfies ClaudeEvent);
        }
        break;
      }
    }
  }

  async abort(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state?.process) return;

    state.process.kill('SIGINT');
  }

  isProcessing(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.processing ?? false;
  }

  async destroySession(sessionId: string): Promise<void> {
    await this.abort(sessionId);
    this.sessions.delete(sessionId);
  }
}
