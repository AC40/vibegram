// Telegram limits
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
export const TELEGRAM_SAFE_MESSAGE_LENGTH = 3800; // Margin for MarkdownV2 overhead

// File handling
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB max download
export const MAX_TELEGRAM_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB Telegram limit

// Session limits
export const MAX_SESSIONS_PER_USER = 6;
export const SESSION_TIMEOUT_DAYS = 30; // Auto-cleanup inactive sessions

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
export const RATE_LIMIT_MAX_REQUESTS = 20; // Max requests per window

// Bash execution
export const BASH_TIMEOUT_MS = 30 * 1000; // 30 seconds
export const BASH_MAX_OUTPUT_BYTES = 100 * 1024; // 100KB

// Streaming
export const STREAMING_EDIT_INTERVAL_MS = 1000;

// History
export const HISTORY_PAGE_SIZE = 5;
export const TOOL_INVOCATIONS_PAGE_SIZE = 10;

// Path security - directories that should never be accessible
export const FORBIDDEN_PATHS = [
  '/etc',
  '/root',
  '/var',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/dev',
  '/proc',
  '/sys',
  '/run',
  '/lib',
  '/lib64',
];

// Allowed base paths for directory browsing (user can only browse within these)
export const ALLOWED_BASE_PATHS = [
  process.env['HOME'] ?? '/tmp',
  '/tmp',
];
