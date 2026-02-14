import { type Api } from 'grammy';
import { basename } from 'path';
import { postfixEmoji } from '../telegram/renderer.js';

export interface FileOperation {
  type: 'write' | 'edit';
  filePath: string;
  insertions: number;
  deletions: number;
}

/**
 * Calculate line stats for a Write operation (all lines are insertions)
 */
export function calcWriteStats(content: string): { insertions: number; deletions: number } {
  const lines = content.split('\n').length;
  return { insertions: lines, deletions: 0 };
}

/**
 * Calculate line stats for an Edit operation
 */
export function calcEditStats(oldString: string, newString: string): { insertions: number; deletions: number } {
  const oldLines = oldString.split('\n').length;
  const newLines = newString.split('\n').length;
  return {
    insertions: Math.max(0, newLines - oldLines) + Math.min(oldLines, newLines),
    deletions: oldLines,
  };
}

/**
 * Aggregate file operations - combine multiple edits to the same file
 */
export function aggregateFileOps(ops: FileOperation[]): FileOperation[] {
  const byPath = new Map<string, FileOperation>();

  for (const op of ops) {
    const existing = byPath.get(op.filePath);
    if (existing) {
      existing.insertions += op.insertions;
      existing.deletions += op.deletions;
      // If any op is a write, mark as write
      if (op.type === 'write') existing.type = 'write';
    } else {
      byPath.set(op.filePath, { ...op });
    }
  }

  return Array.from(byPath.values());
}

/**
 * Format a single file's stats like git diff --stat
 */
function formatFileStat(op: FileOperation): string {
  const filename = basename(op.filePath);
  const plus = op.insertions > 0 ? `+${op.insertions}` : '';
  const minus = op.deletions > 0 ? `-${op.deletions}` : '';
  const stats = [plus, minus].filter(Boolean).join(' ');
  return `  ${filename} (${stats})`;
}

/**
 * Send a summary of all file changes to Telegram
 */
export async function sendChangeSummary(
  api: Api,
  chatId: number,
  ops: FileOperation[],
  sessionEmoji: string
): Promise<void> {
  if (ops.length === 0) return;

  const aggregated = aggregateFileOps(ops);
  const totalInsertions = aggregated.reduce((sum, op) => sum + op.insertions, 0);
  const totalDeletions = aggregated.reduce((sum, op) => sum + op.deletions, 0);

  const fileCount = aggregated.length;
  const fileWord = fileCount === 1 ? 'file' : 'files';

  const lines = [
    `📝 ${fileCount} ${fileWord} changed`,
    '',
    ...aggregated.map(formatFileStat),
    '',
    `  +${totalInsertions} -${totalDeletions}`,
  ];

  await api.sendMessage(chatId, postfixEmoji(lines.join('\n'), sessionEmoji), {
    disable_notification: true,
  });
}
