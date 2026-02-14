# Contributing to Vibegram

Thank you for your interest in contributing to Vibegram! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/vibegram.git`
3. Install dependencies: `pnpm install`
4. Create a branch for your changes: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js >= 22
- pnpm >= 9
- Claude CLI installed and authenticated (`claude login`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Environment Configuration

```bash
cp .env.example .env
# Edit .env with your values
```

### Running Locally

```bash
pnpm dev           # Development mode with hot reload
pnpm build         # Build for production
pnpm typecheck     # Type checking
```

### Testing

```bash
pnpm test          # Run all tests
pnpm test:watch    # Watch mode
pnpm test:coverage # With coverage report
```

We use [Vitest](https://vitest.dev) for testing. Tests are located in the `tests/` directory.

## Project Structure

```
src/
├── constants.ts      # Centralized configuration values
├── core/             # Auth, session management, rate limiting
├── claude/           # Claude CLI integration
├── db/               # Database repositories
├── telegram/         # Telegram-specific utilities
├── commands/         # Bot command handlers
├── handlers/         # Message type handlers
├── services/         # Business logic
└── utils/            # Helpers

tests/                # Test files (*.test.ts)
```

## Code Style

- TypeScript with strict mode enabled
- Use meaningful variable and function names
- Add comments for complex logic
- Magic numbers should go in `src/constants.ts`

## Commit Messages

We follow conventional commit messages:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add conversation history search command
fix: handle empty voice messages gracefully
docs: update README with new commands
test: add rate limiter tests
```

## Pull Request Process

1. Ensure your code passes type checking: `pnpm typecheck`
2. Ensure all tests pass: `pnpm test`
3. Add tests for new functionality
4. Update documentation if needed
5. Submit a pull request with a clear description

## Adding New Commands

1. Create a new file in `src/commands/` (e.g., `mycommand.ts`)
2. Export an async handler function
3. Register it in `src/commands/index.ts`
4. Add to the bot help in `src/commands/bothelp.ts`
5. Update the README with the new command

## Security Considerations

- Path operations should use `isPathSafe()` from `src/telegram/directory-browser.ts`
- File downloads are limited to 20MB (see `MAX_DOCUMENT_SIZE_BYTES`)
- Rate limiting is enforced (20 requests/minute per user)
- Never expose sensitive paths (`/etc`, `/root`, etc.)

## Reporting Issues

When reporting bugs, please include:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version
- Relevant log output

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Feel free to open an issue for questions or discussions about the project.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
