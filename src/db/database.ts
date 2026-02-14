import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let db: Database.Database;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Execute a database operation with retry logic for SQLITE_BUSY errors
 */
export function withRetry<T>(operation: () => T, retries = MAX_RETRIES): T {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return operation();
    } catch (error) {
      const isBusy = error instanceof Error && error.message.includes('SQLITE_BUSY');
      if (!isBusy || attempt === retries) {
        throw error;
      }
      logger.debug({ attempt, retries }, 'Database busy, retrying...');
      // Synchronous sleep for SQLite retry
      const start = Date.now();
      while (Date.now() - start < RETRY_DELAY_MS * attempt) {
        // Busy wait
      }
    }
  }
  throw new Error('Unreachable');
}

export function initDatabase(): Database.Database {
  const dbPath = config.SQLITE_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000'); // Wait up to 5s for locks

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
      default_permission_mode TEXT NOT NULL DEFAULT 'default',
      file_sharing_mode TEXT NOT NULL DEFAULT 'auto'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    -- Conversation history
    CREATE TABLE IF NOT EXISTS conversation_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      turn_type TEXT NOT NULL CHECK (turn_type IN ('user', 'assistant')),
      content TEXT NOT NULL,
      tokens_used INTEGER,
      cost_usd REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conversation_turns_session ON conversation_turns(session_id);
    CREATE INDEX IF NOT EXISTS idx_conversation_turns_created ON conversation_turns(created_at);

    -- Tool invocations log
    CREATE TABLE IF NOT EXISTS tool_invocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      turn_id INTEGER,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (turn_id) REFERENCES conversation_turns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tool_invocations_session ON tool_invocations(session_id);
  `);

  // Create FTS5 virtual table for full-text search (separate exec due to virtual table syntax)
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS conversation_turns_fts USING fts5(
        content,
        content='conversation_turns',
        content_rowid='id'
      );
    `);

    // Triggers to keep FTS synchronized
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS conversation_turns_ai AFTER INSERT ON conversation_turns BEGIN
        INSERT INTO conversation_turns_fts(rowid, content) VALUES (new.id, new.content);
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS conversation_turns_ad AFTER DELETE ON conversation_turns BEGIN
        INSERT INTO conversation_turns_fts(conversation_turns_fts, rowid, content) VALUES('delete', old.id, old.content);
      END;
    `);
  } catch {
    // FTS tables/triggers may already exist
  }

  logger.debug('Database migrations complete');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    logger.info('Database closed');
  }
}
