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
  /** Accumulated text length from partial assistant messages, used to compute deltas. */
  lastTextLength: number;
  /** Text blocks that have already been finalized (text_done emitted), to prevent duplicates. */
  finalizedTexts: Set<string>;
}

export class ClaudeBridge extends EventEmitter implements AIBackend {
  readonly name = 'claude';
  private readonly sessions = new Map<string, SessionState>();

  private getOrCreateState(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { process: null, processing: false, lastTextLength: 0, finalizedTexts: new Set() };
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

      state.lastTextLength = 0;
      state.finalizedTexts.clear();
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
        const isPartial = msg['partial'] === true;
        const message = msg['message'] as { content?: Array<Record<string, unknown>> } | undefined;
        const content = message?.content;
        if (!Array.isArray(content)) break;

        const state = this.sessions.get(sessionId);

        for (const block of content) {
          if (block['type'] === 'text' && typeof block['text'] === 'string') {
            const fullText = block['text'];

            if (isPartial && state) {
              // Compute the new delta from accumulated text
              const delta = fullText.slice(state.lastTextLength);
              state.lastTextLength = fullText.length;
              if (delta) {
                this.emit('event', sessionId, {
                  type: 'text_delta',
                  text: delta,
                } satisfies ClaudeEvent);
              }
            } else {
              // Final assistant message — skip if this text block was already finalized
              if (state?.finalizedTexts.has(fullText)) continue;

              // Emit any remaining delta, then text_done
              if (state && fullText.length > state.lastTextLength) {
                const remaining = fullText.slice(state.lastTextLength);
                this.emit('event', sessionId, {
                  type: 'text_delta',
                  text: remaining,
                } satisfies ClaudeEvent);
              }
              this.emit('event', sessionId, {
                type: 'text_done',
                fullText,
              } satisfies ClaudeEvent);
              if (state) {
                state.finalizedTexts.add(fullText);
                state.lastTextLength = 0;
              }
            }
          } else if (block['type'] === 'tool_use' && !isPartial) {
            this.emit('event', sessionId, {
              type: 'tool_use',
              toolName: block['name'] as string,
              input: (block['input'] ?? {}) as Record<string, unknown>,
            } satisfies ClaudeEvent);
          }
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
