import { getDb } from './database.js';

export interface ConversationTurn {
  readonly id: number;
  readonly sessionId: string;
  readonly turnType: 'user' | 'assistant';
  readonly content: string;
  readonly tokensUsed: number | null;
  readonly costUsd: number | null;
  readonly createdAt: string;
}

export interface ToolInvocation {
  readonly id: number;
  readonly sessionId: string;
  readonly turnId: number | null;
  readonly toolName: string;
  readonly inputJson: string;
  readonly filePath: string | null;
  readonly createdAt: string;
}

export interface SearchResult {
  readonly turnId: number;
  readonly sessionId: string;
  readonly sessionName: string;
  readonly sessionEmoji: string;
  readonly turnType: 'user' | 'assistant';
  readonly snippet: string;
  readonly createdAt: string;
}

function rowToTurn(row: Record<string, unknown>): ConversationTurn {
  return {
    id: row['id'] as number,
    sessionId: row['session_id'] as string,
    turnType: row['turn_type'] as 'user' | 'assistant',
    content: row['content'] as string,
    tokensUsed: row['tokens_used'] as number | null,
    costUsd: row['cost_usd'] as number | null,
    createdAt: row['created_at'] as string,
  };
}

export function addUserTurn(sessionId: string, content: string): ConversationTurn {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO conversation_turns (session_id, turn_type, content) VALUES (?, 'user', ?)`
  ).run(sessionId, content);

  return getTurnById(Number(result.lastInsertRowid))!;
}

export function addAssistantTurn(sessionId: string, content: string): ConversationTurn {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO conversation_turns (session_id, turn_type, content) VALUES (?, 'assistant', ?)`
  ).run(sessionId, content);

  return getTurnById(Number(result.lastInsertRowid))!;
}

export function getTurnById(id: number): ConversationTurn | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM conversation_turns WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToTurn(row) : null;
}

export function updateTurnCost(turnId: number, costUsd: number, tokensUsed?: number): void {
  const db = getDb();
  if (tokensUsed !== undefined) {
    db.prepare('UPDATE conversation_turns SET cost_usd = ?, tokens_used = ? WHERE id = ?').run(costUsd, tokensUsed, turnId);
  } else {
    db.prepare('UPDATE conversation_turns SET cost_usd = ? WHERE id = ?').run(costUsd, turnId);
  }
}

export function addToolInvocation(
  sessionId: string,
  turnId: number | null,
  toolName: string,
  input: Record<string, unknown>,
  filePath?: string
): ToolInvocation {
  const db = getDb();
  const inputJson = JSON.stringify(input);
  const result = db.prepare(
    `INSERT INTO tool_invocations (session_id, turn_id, tool_name, input_json, file_path) VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, turnId, toolName, inputJson, filePath ?? null);

  const row = db.prepare('SELECT * FROM tool_invocations WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>;
  return {
    id: row['id'] as number,
    sessionId: row['session_id'] as string,
    turnId: row['turn_id'] as number | null,
    toolName: row['tool_name'] as string,
    inputJson: row['input_json'] as string,
    filePath: row['file_path'] as string | null,
    createdAt: row['created_at'] as string,
  };
}

export function getHistory(sessionId: string, limit: number = 50, offset: number = 0): ConversationTurn[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM conversation_turns WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(sessionId, limit, offset) as Record<string, unknown>[];
  return rows.map(rowToTurn);
}

export function getHistoryCount(sessionId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM conversation_turns WHERE session_id = ?').get(sessionId) as { count: number };
  return row.count;
}

export function searchConversations(userId: number, query: string, limit: number = 10): SearchResult[] {
  const db = getDb();

  // Use FTS5 with snippet for highlighting
  const rows = db.prepare(`
    SELECT
      ct.id as turn_id,
      ct.session_id,
      s.name as session_name,
      s.emoji as session_emoji,
      ct.turn_type,
      snippet(conversation_turns_fts, 0, '**', '**', '...', 20) as snippet,
      ct.created_at
    FROM conversation_turns_fts fts
    JOIN conversation_turns ct ON fts.rowid = ct.id
    JOIN sessions s ON ct.session_id = s.id
    WHERE s.user_id = ? AND conversation_turns_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(userId, query, limit) as Record<string, unknown>[];

  return rows.map(row => ({
    turnId: row['turn_id'] as number,
    sessionId: row['session_id'] as string,
    sessionName: row['session_name'] as string,
    sessionEmoji: row['session_emoji'] as string,
    turnType: row['turn_type'] as 'user' | 'assistant',
    snippet: row['snippet'] as string,
    createdAt: row['created_at'] as string,
  }));
}

export function deleteSessionHistory(sessionId: string): void {
  const db = getDb();
  // Tool invocations are deleted via CASCADE
  db.prepare('DELETE FROM conversation_turns WHERE session_id = ?').run(sessionId);
}

export function getToolInvocations(sessionId: string, limit: number = 50): ToolInvocation[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM tool_invocations WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(sessionId, limit) as Record<string, unknown>[];

  return rows.map(row => ({
    id: row['id'] as number,
    sessionId: row['session_id'] as string,
    turnId: row['turn_id'] as number | null,
    toolName: row['tool_name'] as string,
    inputJson: row['input_json'] as string,
    filePath: row['file_path'] as string | null,
    createdAt: row['created_at'] as string,
  }));
}
