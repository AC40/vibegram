import * as sessionRepo from '../db/session-repository.js';
import * as settingsRepo from '../db/settings-repository.js';
import type { BackendType, BufferedMessage, Session, UserSettings } from '../types/session.js';
import { logger } from '../utils/logger.js';

const activeSessionIds = new Map<number, string>(); // userId → sessionId
const bufferedMessages = new Map<string, BufferedMessage[]>(); // sessionId → messages

export function getActiveSessionId(userId: number): string | null {
  return activeSessionIds.get(userId) ?? null;
}

export function getActiveSession(userId: number): Session | null {
  const id = getActiveSessionId(userId);
  if (!id) return null;
  return sessionRepo.getSessionById(id);
}

export function setActiveSession(userId: number, sessionId: string): void {
  activeSessionIds.set(userId, sessionId);
}

export function getSessionById(sessionId: string): Session | null {
  return sessionRepo.getSessionById(sessionId);
}

export function createSession(userId: number, name: string, cwd: string, backend: BackendType): Session {
  const settings = settingsRepo.getOrCreateSettings(userId);
  const defaultMode = backend === 'codex' ? settings.defaultCodexMode : settings.defaultPermissionMode;
  const session = sessionRepo.createSession(userId, name, cwd, backend, defaultMode);
  setActiveSession(userId, session.id);
  logger.info({ userId, sessionId: session.id, name, emoji: session.emoji, backend }, 'Session created');
  return session;
}

export function getSessions(userId: number): Session[] {
  return sessionRepo.getSessionsByUserId(userId);
}

export function switchSession(userId: number, sessionId: string): { session: Session; buffered: BufferedMessage[] } {
  const session = sessionRepo.getSessionById(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error('Session not found');
  }
  setActiveSession(userId, sessionId);
  sessionRepo.updateSession(sessionId, {});

  const buffered = bufferedMessages.get(sessionId) ?? [];
  bufferedMessages.delete(sessionId);

  logger.info({ userId, sessionId, name: session.name }, 'Switched session');
  return { session, buffered };
}

export function deleteSession(userId: number, sessionId: string): void {
  const session = sessionRepo.getSessionById(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error('Session not found');
  }
  sessionRepo.deleteSession(sessionId);
  bufferedMessages.delete(sessionId);

  if (getActiveSessionId(userId) === sessionId) {
    const remaining = sessionRepo.getSessionsByUserId(userId);
    if (remaining.length > 0) {
      setActiveSession(userId, remaining[0]!.id);
    } else {
      activeSessionIds.delete(userId);
    }
  }
  logger.info({ userId, sessionId }, 'Session deleted');
}

export function renameSession(sessionId: string, name: string): void {
  sessionRepo.updateSession(sessionId, { name });
}

export function updateSessionCwd(sessionId: string, cwd: string): void {
  sessionRepo.updateSession(sessionId, { cwd });
}

export function updateSessionBackendId(sessionId: string, backendSessionId: string): void {
  sessionRepo.updateSession(sessionId, { backendSessionId });
}

export function updateSessionStatus(sessionId: string, status: Session['status']): void {
  sessionRepo.updateSession(sessionId, { status });
}

export function updateSessionPermissionMode(sessionId: string, permissionMode: string): void {
  sessionRepo.updateSession(sessionId, { permissionMode });
}

export function clearSession(sessionId: string): void {
  sessionRepo.clearBackendSession(sessionId);
}

export function bufferMessage(sessionId: string, message: BufferedMessage): void {
  const existing = bufferedMessages.get(sessionId) ?? [];
  existing.push(message);
  bufferedMessages.set(sessionId, existing);
}

export function getSettings(userId: number): UserSettings {
  return settingsRepo.getOrCreateSettings(userId);
}

export function updateSettings(userId: number, updates: Parameters<typeof settingsRepo.updateSettings>[1]): void {
  settingsRepo.updateSettings(userId, updates);
}

export function initializeUserSessions(userId: number): void {
  const sessions = sessionRepo.getSessionsByUserId(userId);
  if (sessions.length > 0 && !getActiveSessionId(userId)) {
    setActiveSession(userId, sessions[0]!.id);
  }
}
