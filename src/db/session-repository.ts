import { randomUUID } from 'crypto';
import { getDb } from './database.js';
import type { Session, SessionStatus } from '../types/session.js';

const ANIMAL_EMOJIS = ['🐙', '🦊', '🐺', '🦅', '🐋', '🦎', '🐆', '🦉', '🐬', '🦈', '🐢', '🦋'];

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as number,
    name: row['name'] as string,
    cwd: row['cwd'] as string,
    emoji: row['emoji'] as string,
    claudeSessionId: (row['claude_session_id'] as string) ?? null,
    status: row['status'] as SessionStatus,
    permissionMode: row['permission_mode'] as string,
    createdAt: row['created_at'] as string,
    lastActiveAt: row['last_active_at'] as string,
  };
}

export function createSession(userId: number, name: string, cwd: string, permissionMode: string): Session {
  const db = getDb();
  const id = randomUUID();
  const usedEmojis = getSessionsByUserId(userId).map((s) => s.emoji);
  const availableEmojis = ANIMAL_EMOJIS.filter((e) => !usedEmojis.includes(e));
  const emoji = availableEmojis[Math.floor(Math.random() * availableEmojis.length)] ?? ANIMAL_EMOJIS[0]!;

  db.prepare(
    `INSERT INTO sessions (id, user_id, name, cwd, emoji, permission_mode)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, name, cwd, emoji, permissionMode);

  return getSessionById(id)!;
}

export function getSessionById(id: string): Session | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToSession(row) : null;
}

export function getSessionsByUserId(userId: number): Session[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_active_at DESC').all(userId) as Record<string, unknown>[];
  return rows.map(rowToSession);
}

export function updateSession(id: string, updates: Partial<Pick<Session, 'name' | 'cwd' | 'claudeSessionId' | 'status' | 'permissionMode'>>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.cwd !== undefined) { fields.push('cwd = ?'); values.push(updates.cwd); }
  if (updates.claudeSessionId !== undefined) { fields.push('claude_session_id = ?'); values.push(updates.claudeSessionId); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.permissionMode !== undefined) { fields.push('permission_mode = ?'); values.push(updates.permissionMode); }

  if (fields.length === 0) return;

  fields.push("last_active_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function clearClaudeSession(id: string): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET claude_session_id = NULL, status = 'idle', last_active_at = datetime('now') WHERE id = ?").run(id);
}

export function getAllUserIds(): number[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT user_id FROM sessions').all() as { user_id: number }[];
  return rows.map(r => r.user_id);
}

export function getSessionByEmoji(userId: number, emoji: string): Session | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE user_id = ? AND emoji = ?').get(userId, emoji) as Record<string, unknown> | undefined;
  return row ? rowToSession(row) : null;
}
