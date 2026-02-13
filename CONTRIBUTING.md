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
pnpm dev        # Development mode with hot reload
pnpm build      # Build for production
pnpm typecheck  # Type checking
pnpm test       # Run tests
```

## Code Style

- We use TypeScript with strict mode enabled
- Code is formatted consistently (run `pnpm typecheck` before committing)
- Use meaningful variable and function names
- Add comments for complex logic

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
```

## Pull Request Process

1. Ensure your code passes type checking: `pnpm typecheck`
2. Ensure tests pass: `pnpm test`
3. Update documentation if needed
4. Submit a pull request with a clear description

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
