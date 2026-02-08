import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): Database.Database {
  const dbPath = config.SQLITE_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  logger.info({ path: dbPath }, 'Database initialized');
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cwd TEXT NOT NULL,
      emoji TEXT NOT NULL,
      claude_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      permission_mode TEXT NOT NULL DEFAULT 'default',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      default_directory TEXT NOT NULL DEFAULT '~',
      verbosity TEXT NOT NULL DEFAULT 'normal',
      notification_mode TEXT NOT NULL DEFAULT 'smart',
      cross_session_visibility TEXT NOT NULL DEFAULT 'show_all',
      default_permission_mode TEXT NOT NULL DEFAULT 'default'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);

  logger.debug('Database migrations complete');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    logger.info('Database closed');
  }
}
