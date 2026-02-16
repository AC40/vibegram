import type { AIBackend } from '../types/agent.js';
import type { BackendType, Session } from '../types/session.js';

const backends = new Map<BackendType, AIBackend>();

export function registerBackends(entries: Record<BackendType, AIBackend>): void {
  backends.set('claude', entries.claude);
  backends.set('codex', entries.codex);
}

export function getBackend(backend: BackendType): AIBackend {
  const bridge = backends.get(backend);
  if (!bridge) {
    throw new Error(`Backend "${backend}" is not initialized`);
  }
  return bridge;
}

export function getBackendForSession(session: Pick<Session, 'backend'>): AIBackend {
  return getBackend(session.backend);
}
