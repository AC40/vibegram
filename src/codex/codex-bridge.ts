import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import type { AIBackend, SendMessageOptions } from '../types/agent.js';
import type { BackendEvent, Attachment } from '../types/claude.js';
import { buildPromptWithAttachments } from '../core/attachment-prompt.js';
import { logger } from '../utils/logger.js';

interface SessionState {
  process: ChildProcess | null;
  processing: boolean;
  turnStartedAt: number;
  lastAssistantText: string;
}

interface CodexUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export class CodexBridge extends EventEmitter implements AIBackend {
  readonly name = 'codex';
  private readonly sessions = new Map<string, SessionState>();

  private getOrCreateState(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { process: null, processing: false, turnStartedAt: 0, lastAssistantText: '' };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  async startSession(_options: { cwd: string; mode: string }): Promise<string> {
    const trackingId = crypto.randomUUID();
    this.getOrCreateState(trackingId);
    return trackingId;
  }

  async sendMessage(sessionId: string, message: string, attachments?: Attachment[]): Promise<void> {
    await this.sendMessageWithOptions(sessionId, message, {}, attachments);
  }

  async sendMessageWithOptions(
    sessionId: string,
    prompt: string,
    options: SendMessageOptions,
    attachments?: Attachment[],
  ): Promise<void> {
    const state = this.getOrCreateState(sessionId);
    if (state.processing) throw new Error('Session is already processing');

    state.processing = true;
    state.turnStartedAt = Date.now();
    state.lastAssistantText = '';

    const finalPrompt = buildPromptWithAttachments(prompt, attachments ?? []);

    const args = options.resume
      ? ['exec', 'resume', '--json', options.resume]
      : ['exec', '--json', '--skip-git-repo-check'];

    this.appendModeFlags(args, options.mode, !!options.resume);
    args.push(finalPrompt);

    logger.debug({ sessionId, cwd: options.cwd, resume: !!options.resume, args }, 'Spawning codex CLI');

    try {
      const child = spawn('codex', args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      state.process = child;
      let sawTurnCompletion = false;
      let stderrChunks = '';
      const rl = createInterface({ input: child.stdout! });

      rl.on('line', (line) => {
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          if (this.processCodexMessage(sessionId, msg)) {
            sawTurnCompletion = true;
          }
        } catch {
          logger.debug({ sessionId, line }, 'Non-JSON line from codex CLI');
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks += chunk.toString();
      });

      await new Promise<void>((resolve) => {
        child.on('close', (code) => {
          state.process = null;
          state.processing = false;

          if (code !== 0 && code !== null) {
            const errMsg = stderrChunks.trim() || `codex CLI exited with code ${code}`;
            logger.error({ sessionId, code, stderr: stderrChunks }, 'Codex CLI error');
            this.emit('event', sessionId, { type: 'error', message: errMsg } satisfies BackendEvent);
          } else if (!sawTurnCompletion) {
            // Defensive fallback if CLI exits cleanly without emitting turn.completed.
            this.emit('event', sessionId, {
              type: 'result',
              result: state.lastAssistantText,
              costUsd: 0,
              durationMs: Date.now() - state.turnStartedAt,
              numTurns: 1,
            } satisfies BackendEvent);
          }

          resolve();
        });

        child.on('error', (error) => {
          state.process = null;
          state.processing = false;
          logger.error({ sessionId, error: error.message }, 'Failed to spawn codex CLI');
          this.emit('event', sessionId, {
            type: 'error',
            message: `Failed to spawn codex: ${error.message}`,
          } satisfies BackendEvent);
          resolve();
        });
      });
    } finally {
      state.processing = false;
    }
  }

  private appendModeFlags(args: string[], mode: string | undefined, isResume: boolean): void {
    switch (mode) {
      case 'read-only':
        if (isResume) args.push('-c', 'sandbox_mode=read-only');
        else args.push('--sandbox', 'read-only');
        break;
      case 'workspace-write':
        if (isResume) args.push('-c', 'sandbox_mode=workspace-write');
        else args.push('--sandbox', 'workspace-write');
        break;
      case 'full-auto':
        args.push('--full-auto');
        break;
      case 'danger':
        args.push('--dangerously-bypass-approvals-and-sandbox');
        break;
      default:
        // Defaults to Codex CLI config when not explicitly set.
        break;
    }
  }

  private processCodexMessage(sessionId: string, msg: Record<string, unknown>): boolean {
    const type = msg['type'];
    const state = this.sessions.get(sessionId);

    if (type === 'thread.started') {
      const threadId = msg['thread_id'];
      if (typeof threadId === 'string') {
        this.emit('event', sessionId, {
          type: 'init',
          sessionId: threadId,
        } satisfies BackendEvent);
      }
      return false;
    }

    if (type === 'item.started') {
      const item = msg['item'] as Record<string, unknown> | undefined;
      if (item?.['type'] === 'command_execution') {
        this.emit('event', sessionId, {
          type: 'tool_use',
          toolName: 'Bash',
          input: {
            command: item['command'],
            status: item['status'],
          },
        } satisfies BackendEvent);
      }
      return false;
    }

    if (type === 'item.completed') {
      const item = msg['item'] as Record<string, unknown> | undefined;
      if (!item) return false;

      if (item['type'] === 'agent_message' && typeof item['text'] === 'string') {
        state && (state.lastAssistantText = item['text']);
        this.emit('event', sessionId, {
          type: 'text_done',
          fullText: item['text'],
        } satisfies BackendEvent);
        return false;
      }

      if (item['type'] === 'command_execution') {
        this.emit('event', sessionId, {
          type: 'tool_result',
          toolName: 'Bash',
          output: typeof item['aggregated_output'] === 'string' ? item['aggregated_output'] : '',
          exitCode: typeof item['exit_code'] === 'number' ? item['exit_code'] : undefined,
        } satisfies BackendEvent);
        return false;
      }

      return false;
    }

    if (type === 'turn.completed') {
      const usage = (msg['usage'] as CodexUsage | undefined) ?? {};
      const outputTokens = usage.output_tokens ?? 0;

      this.emit('event', sessionId, {
        type: 'result',
        result: state?.lastAssistantText ?? '',
        costUsd: 0,
        durationMs: state ? Date.now() - state.turnStartedAt : 0,
        numTurns: outputTokens > 0 ? 1 : 0,
      } satisfies BackendEvent);
      return true;
    }

    return false;
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
