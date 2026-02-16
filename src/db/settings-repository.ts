import { getDb } from './database.js';
import { config } from '../config.js';
import type {
  BackendType,
  CrossSessionVisibility,
  FileSharingMode,
  NotificationMode,
  UserSettings,
  Verbosity,
} from '../types/session.js';

function rowToSettings(row: Record<string, unknown>): UserSettings {
  return {
    userId: row['user_id'] as number,
    defaultDirectory: row['default_directory'] as string,
    verbosity: row['verbosity'] as Verbosity,
    notificationMode: row['notification_mode'] as NotificationMode,
    crossSessionVisibility: row['cross_session_visibility'] as CrossSessionVisibility,
    defaultBackend: ((row['default_backend'] as BackendType | undefined) ?? 'codex'),
    defaultPermissionMode: row['default_permission_mode'] as string,
    fileSharingMode: (row['file_sharing_mode'] as FileSharingMode) ?? 'auto',
    defaultCodexMode: (row['default_codex_mode'] as string | undefined) ?? 'workspace-write',
  };
}

export function getOrCreateSettings(userId: number): UserSettings {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;

  if (row) return rowToSettings(row);

  db.prepare(
    `INSERT INTO user_settings (user_id, default_directory) VALUES (?, ?)`
  ).run(userId, config.DEFAULT_WORKING_DIR);

  return getOrCreateSettings(userId);
}

export function updateSettings(
  userId: number,
  updates: Partial<
    Pick<
      UserSettings,
      | 'defaultDirectory'
      | 'verbosity'
      | 'notificationMode'
      | 'crossSessionVisibility'
      | 'defaultBackend'
      | 'defaultPermissionMode'
      | 'fileSharingMode'
      | 'defaultCodexMode'
    >
  >
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.defaultDirectory !== undefined) { fields.push('default_directory = ?'); values.push(updates.defaultDirectory); }
  if (updates.verbosity !== undefined) { fields.push('verbosity = ?'); values.push(updates.verbosity); }
  if (updates.notificationMode !== undefined) { fields.push('notification_mode = ?'); values.push(updates.notificationMode); }
  if (updates.crossSessionVisibility !== undefined) { fields.push('cross_session_visibility = ?'); values.push(updates.crossSessionVisibility); }
  if (updates.defaultBackend !== undefined) { fields.push('default_backend = ?'); values.push(updates.defaultBackend); }
  if (updates.defaultPermissionMode !== undefined) { fields.push('default_permission_mode = ?'); values.push(updates.defaultPermissionMode); }
  if (updates.fileSharingMode !== undefined) { fields.push('file_sharing_mode = ?'); values.push(updates.fileSharingMode); }
  if (updates.defaultCodexMode !== undefined) { fields.push('default_codex_mode = ?'); values.push(updates.defaultCodexMode); }

  if (fields.length === 0) return;
  values.push(userId);

  db.prepare(`UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
}
