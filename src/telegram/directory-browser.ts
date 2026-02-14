import { readdirSync, statSync } from 'fs';
import { resolve, normalize } from 'path';
import { buildDirectoryKeyboard } from './keyboard-builder.js';
import type { InlineKeyboard } from 'grammy';
import { logger } from '../utils/logger.js';
import { FORBIDDEN_PATHS, ALLOWED_BASE_PATHS } from '../constants.js';

/**
 * Check if a path is safe to browse (not in forbidden areas)
 */
export function isPathSafe(path: string): boolean {
  const normalizedPath = normalize(resolve(path));

  // Check against forbidden paths
  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalizedPath === forbidden || normalizedPath.startsWith(forbidden + '/')) {
      return false;
    }
  }

  // Must be within an allowed base path
  const isWithinAllowed = ALLOWED_BASE_PATHS.some(base => {
    const normalizedBase = normalize(resolve(base));
    return normalizedPath === normalizedBase || normalizedPath.startsWith(normalizedBase + '/');
  });

  return isWithinAllowed;
}

export function browseDirectory(path: string): { keyboard: InlineKeyboard; resolvedPath: string; error?: string } {
  const resolvedPath = resolve(path.replace(/^~/, process.env['HOME'] ?? '/tmp'));

  // Security check - prevent access to sensitive directories
  if (!isPathSafe(resolvedPath)) {
    logger.warn({ path: resolvedPath }, 'Blocked access to forbidden path');
    const safePath = process.env['HOME'] ?? '/tmp';
    return {
      keyboard: buildDirectoryKeyboard([], safePath),
      resolvedPath: safePath,
      error: 'Access denied: path is outside allowed directories',
    };
  }

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
    if (!isPathSafe(resolved)) return false;
    return statSync(resolved).isDirectory();
  } catch {
    return false;
  }
}
