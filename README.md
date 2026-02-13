# Vibegram

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

A Telegram bot that turns your chat into a full-featured [Claude Code](https://docs.anthropic.com/en/docs/claude-code) client. Manage multiple concurrent coding sessions, stream responses in real time, and work with files, voice, and images — all from Telegram.

## Features

- **Multi-session management** -- up to 6 concurrent Claude sessions per user, each with its own working directory and emoji identifier
- **Real-time streaming** -- responses stream into Telegram as they are generated, with Markdown formatting on completion
- **Voice input** -- send a voice message and it is transcribed via Deepgram, then forwarded to Claude
- **Photo & document support** -- attach images or files and Claude processes them as part of the conversation
- **Direct bash execution** -- prefix a message with `!` to run a shell command in the session's working directory
- **Directory browser** -- navigate the file system with inline keyboard buttons
- **Permission modes** -- choose between `default`, `acceptEdits`, `plan`, and `dontAsk` per session
- **Persistent settings** -- user preferences and sessions are stored in SQLite
- **Smart notifications** -- configurable notification modes: `smart`, `all`, or `none`

## Prerequisites

- **Node.js** >= 22
- **pnpm** >= 9
- **Claude CLI** installed and authenticated (`claude login`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- *(Optional)* A [Deepgram](https://deepgram.com) API key for voice transcription

## Setup

```bash
# Clone the repository
git clone https://github.com/<your-username>/vibegram.git
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

## Usage

### Development

```bash
pnpm dev        # Watch mode with tsx
```

### Production

```bash
pnpm build      # Build with tsup → dist/
pnpm start      # Run compiled output
```

### Type Checking

```bash
pnpm typecheck  # tsc --noEmit
```

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Initialize the bot |
| `/new` | Create a new Claude session |
| `/sessions` | List all active sessions |
| `/switch` | Switch between sessions |
| `/delete` | Delete a session |
| `/rename` | Rename a session |
| `/cd` | Change session working directory |
| `/clear` | Reset session context |
| `/cancel` | Abort the current query |
| `/status` | Show session status |
| `/mode` | Set permission mode |
| `/verbosity` | Set output verbosity (`minimal` / `normal` / `verbose`) |
| `/notifications` | Configure notification behavior |
| `/settings` | View and edit user preferences |
| `/bothelp` | Show command reference |

## Architecture

```
src/
├── index.ts                 # Entry point
├── config.ts                # Zod-validated environment config
├── bot.ts                   # Grammy bot setup and middleware
├── core/                    # Auth, routing, session lifecycle, message queue
├── claude/                  # Claude CLI bridge and event routing
├── db/                      # SQLite database, sessions & settings repos
├── telegram/                # Streaming editor, keyboards, Markdown renderer, chunker
├── commands/                # /command handlers
├── handlers/                # Text, bash, voice, photo, document, callback queries
├── services/                # Deepgram transcription, bash executor
└── utils/                   # Logger, Telegram file helpers
```

### Key Design Decisions

- **Claude CLI over SDK** -- Claude is invoked as a child process (`claude -p --output-format stream-json`) for streaming JSON events, rather than through an SDK
- **Per-session message queue** -- prevents concurrent queries to the same Claude process
- **Markdown on finalize only** -- during streaming, messages are sent as plain text to avoid MarkdownV2 parse errors from partial content; formatting is applied on the final edit
- **Graceful shutdown** -- SIGINT/SIGTERM handlers close the database and stop the bot cleanly

## Tech Stack

- [Grammy](https://grammy.dev) -- Telegram bot framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) -- SQLite driver
- [Pino](https://getpino.io) -- Structured logging
- [telegramify-markdown](https://github.com/nicepkg/telegramify-markdown) -- Markdown to Telegram MarkdownV2
- [Zod](https://zod.dev) -- Runtime schema validation
- [tsup](https://tsup.egoist.dev) -- TypeScript bundler
- [Deepgram SDK](https://developers.deepgram.com) -- Voice-to-text transcription

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a pull request.

## License

[MIT](LICENSE) — see the [LICENSE](LICENSE) file for details.
