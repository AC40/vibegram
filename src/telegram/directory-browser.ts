import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { buildDirectoryKeyboard } from './keyboard-builder.js';
import type { InlineKeyboard } from 'grammy';
import { logger } from '../utils/logger.js';

export function browseDirectory(path: string): { keyboard: InlineKeyboard; resolvedPath: string } {
  const resolvedPath = resolve(path.replace(/^~/, process.env['HOME'] ?? '/tmp'));

  try {
    const entries = readdirSync(resolvedPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();

    return {
      keyboard: buildDirectoryKeyboard(dirs, resolvedPath),
      resolvedPath,
    };
  } catch (error) {
    logger.warn({ path: resolvedPath, error }, 'Failed to browse directory');
    return {
      keyboard: buildDirectoryKeyboard([], resolvedPath),
      resolvedPath,
    };
  }
}

export function isValidDirectory(path: string): boolean {
  try {
    const resolved = resolve(path.replace(/^~/, process.env['HOME'] ?? '/tmp'));
    return statSync(resolved).isDirectory();
  } catch {
    return false;
  }
}
