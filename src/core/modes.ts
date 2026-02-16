import type { BackendType } from '../types/session.js';

export const CLAUDE_MODES = ['default', 'acceptEdits', 'plan', 'dontAsk'] as const;
export const CODEX_MODES = ['read-only', 'workspace-write', 'full-auto', 'danger'] as const;

export function getModesForBackend(backend: BackendType): readonly string[] {
  return backend === 'codex' ? CODEX_MODES : CLAUDE_MODES;
}

export function isValidModeForBackend(backend: BackendType, mode: string): boolean {
  return getModesForBackend(backend).includes(mode);
}
