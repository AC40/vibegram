import telegramifyMarkdown from 'telegramify-markdown';

export function renderMarkdown(text: string): string {
  try {
    return telegramifyMarkdown(text, 'escape');
  } catch {
    // Fallback: escape special characters manually
    return escapeMarkdownV2(text);
  }
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export function formatSessionInfo(
  emoji: string,
  name: string,
  cwd: string,
  status: string,
  permissionMode: string,
): string {
  return [
    `${emoji} *${escapeMarkdownV2(name)}*`,
    `Directory: \`${escapeMarkdownV2(cwd)}\``,
    `Status: ${escapeMarkdownV2(status)}`,
    `Mode: ${escapeMarkdownV2(permissionMode)}`,
  ].join('\n');
}

export function postfixEmoji(text: string, emoji: string): string {
  return `${text} ${emoji}`;
}
