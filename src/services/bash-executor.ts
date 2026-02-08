import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';

const BLOCKED_COMMANDS = new Set([
  'rm', 'rmdir', 'dd', 'mkfs', 'fdisk', 'shutdown', 'reboot', 'halt',
  'sudo', 'su', 'passwd', 'kill', 'killall', 'pkill',
  'chmod', 'chown', 'iptables',
]);

const BLOCKED_PATTERNS = [
  /rm\s+(-\w*)?r\w*f\w*\s+\//,     // rm -rf /
  /\|\s*(sh|bash|zsh|dash)\b/,      // pipe to shell
  />\s*\/dev\//,                      // write to /dev/
  /:\(\)\s*{\s*:\|:\s*&\s*}\s*;/,    // fork bomb
  /dd\s+if=/,                         // dd if=
  />\s*\/etc\//,                      // write to /etc/
  /mkfs/,                             // filesystem format
];

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 100_000;

export interface BashResult {
  output: string;
  exitCode: number;
  blocked: boolean;
  reason?: string;
}

export function executeBashCommand(command: string, cwd: string): BashResult {
  // Extract base command
  const baseCommand = command.trim().split(/\s+/)[0]?.split('/').pop() ?? '';

  if (BLOCKED_COMMANDS.has(baseCommand)) {
    return { output: '', exitCode: -1, blocked: true, reason: `Command '${baseCommand}' is blocked` };
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { output: '', exitCode: -1, blocked: true, reason: `Dangerous pattern detected` };
    }
  }

  try {
    const output = execSync(command, {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { output: output ?? '', exitCode: 0, blocked: false };
  } catch (error: unknown) {
    const execError = error as { status?: number; stdout?: string; stderr?: string; message?: string };

    if (execError.message?.includes('TIMEOUT')) {
      return { output: 'Command timed out (30s limit)', exitCode: -1, blocked: false };
    }

    const output = [execError.stdout, execError.stderr].filter(Boolean).join('\n');
    return { output: output || execError.message || 'Command failed', exitCode: execError.status ?? 1, blocked: false };
  }
}
