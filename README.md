# Vibegram

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

A Telegram bot that turns your chat into a full-featured coding agent client. It supports both [Codex CLI](https://github.com/openai/codex) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code), with per-session backend selection, streaming responses, files, voice, and images.

## Features

- **Multi-session management** -- up to 6 concurrent sessions per user, each with its own backend, working directory, and emoji identifier
- **Per-session backend selection** -- choose `codex` or `claude` when creating a session
- **Real-time streaming** -- responses stream into Telegram as they are generated, with Markdown formatting on completion
- **Voice input** -- send a voice message and it is transcribed via Deepgram, then forwarded to the active backend
- **Photo & document support** -- attach images or files and they are processed as part of the conversation
- **Direct bash execution** -- prefix a message with `!` to run a shell command in the session's working directory
- **Directory browser** -- navigate the file system with inline keyboard buttons (with path sanitization)
- **Backend-specific modes** -- Claude modes (`default`, `acceptEdits`, `plan`, `dontAsk`) and Codex modes (`read-only`, `workspace-write`, `full-auto`, `danger`)
- **Codex plan approval gate** -- auto-detects `<proposed_plan>` output and requires Telegram approval/request-changes/abort before continuing
- **Persistent settings** -- user preferences and sessions are stored in SQLite
- **Smart notifications** -- configurable notification modes: `smart`, `all`, or `none`
- **Conversation history** -- browse and search past conversations with full-text search
- **Cost tracking** -- monitor API costs per session and total usage
- **Rate limiting** -- built-in protection against API abuse (20 requests/minute)

## Prerequisites

- **Node.js** >= 22
- **pnpm** >= 9
- **Codex CLI** installed and authenticated (`codex login`)
- **Claude CLI** installed and authenticated (`claude login`) if you want Claude sessions
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- *(Optional)* A [Deepgram](https://deepgram.com) API key for voice transcription

## Setup

```bash
# Clone the repository
git clone https://github.com/AC40/vibegram.git
cd vibegram

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your values
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `ALLOWED_USER_IDS` | Yes | Comma-separated Telegram user IDs allowed to use the bot |
| `DEFAULT_WORKING_DIR` | No | Default directory for new sessions (defaults to `$HOME`) |
| `DEEPGRAM_API_KEY` | No | Deepgram API key for voice transcription |
| `SQLITE_PATH` | No | Database file path (defaults to `./data/vibegram.db`) |
| `LOG_LEVEL` | No | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` (defaults to `info`) |
| `PORT` | No | HTTP server port for webhooks/health checks (defaults to `4020`) |
| `USE_WEBHOOK` | No | Set to `true` to use webhook mode instead of polling |

## Usage

### Development

```bash
pnpm dev        # Watch mode with tsx
pnpm test       # Run tests
pnpm typecheck  # Type checking
```

### Production

```bash
pnpm build      # Build with tsup -> dist/
pnpm start      # Run compiled output
```

## Bot Commands

### Session Management

| Command | Description |
|---|---|
| `/start` | Initialize the bot |
| `/new [backend] [name] [path]` | Create a new session (`codex`/`claude`) |
| `/sessions` | List all active sessions |
| `/switch` | Switch between sessions |
| `/delete` | Delete a session |
| `/rename` | Rename a session |
| `/cd` | Change session working directory |
| `/clear` | Reset session context |
| `/cancel` | Abort the current query |
| `/status` | Show session status |

### Settings

| Command | Description |
|---|---|
| `/mode` | Set backend-specific mode for active session |
| `/verbosity` | Set output verbosity (`minimal` / `normal` / `verbose`) |
| `/notifications` | Configure notification behavior |
| `/settings` | View and edit user preferences |

### History & Tracking

| Command | Description |
|---|---|
| `/history` | Browse conversation history (paginated) |
| `/search <query>` | Full-text search across all sessions |
| `/tools` | View recent tool invocations |
| `/costs` | View API cost summary |

### Help

| Command | Description |
|---|---|
| `/bothelp` | Show command reference |
| `/help` | Alias for `/bothelp` |

## Verbosity Modes

- **minimal** -- Only shows the final response (no streaming, no status messages)
- **normal** -- Shows streaming responses with completion summary
- **verbose** -- Shows all tool invocations and processing messages

## Architecture

```
src/
├── index.ts                 # Entry point
├── config.ts                # Zod-validated environment config
├── constants.ts             # Centralized configuration constants
├── bot.ts                   # Grammy bot setup and middleware
├── server.ts                # HTTP server for webhooks/health
├── core/                    # Auth, routing, backend factory, session lifecycle, message queue
├── claude/                  # Claude bridge + shared event routing
├── codex/                   # Codex CLI bridge
├── db/                      # SQLite database, sessions, settings, history repos
├── telegram/                # Streaming editor, keyboards, Markdown renderer, chunker
├── commands/                # /command handlers
├── handlers/                # Text, bash, voice, photo, document, callback queries
├── services/                # Deepgram transcription, bash executor, file operations
├── types/                   # TypeScript interfaces
└── utils/                   # Logger, Telegram file helpers
```

### Key Design Decisions

- **CLI bridges over SDKs** -- both backends are invoked as child processes (`claude` and `codex exec --json`) and normalized into one event pipeline
- **Per-session message queue** -- prevents concurrent queries to the same backend process
- **Markdown on finalize only** -- during streaming, messages are sent as plain text; formatting is applied on final edit
- **Graceful shutdown** -- SIGINT/SIGTERM handlers close the database and stop the bot cleanly
- **Session auto-cleanup** -- inactive sessions (30+ days) are automatically removed on startup

### Security

- **Path sanitization** -- directory browser blocks access to sensitive system paths
- **File size limits** -- document uploads capped at 20MB
- **Rate limiting** -- 20 requests per minute per user
- **User allowlist** -- only authorized Telegram user IDs can use the bot

## Tech Stack

- [Grammy](https://grammy.dev) -- Telegram bot framework with auto-retry
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) -- SQLite driver with WAL mode
- [Vitest](https://vitest.dev) -- Testing framework
- [Pino](https://getpino.io) -- Structured logging
- [telegramify-markdown](https://github.com/nicepkg/telegramify-markdown) -- Markdown to Telegram MarkdownV2
- [Zod](https://zod.dev) -- Runtime schema validation
- [tsup](https://tsup.egoist.dev) -- TypeScript bundler
- [Deepgram SDK](https://developers.deepgram.com) -- Voice-to-text transcription

## Testing

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a pull request.

## License

[MIT](LICENSE) -- see the [LICENSE](LICENSE) file for details.
