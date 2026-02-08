const TELEGRAM_MAX_LENGTH = 4096;
const SAFE_LIMIT = 3800; // Leave margin for MarkdownV2 overhead + emoji postfix

export function chunkText(text: string, limit: number = SAFE_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt < limit * 0.5) {
      // If newline is too far back, split at a space
      splitAt = remaining.lastIndexOf(' ', limit);
    }
    if (splitAt < limit * 0.3) {
      // Hard split
      splitAt = limit;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

export { SAFE_LIMIT, TELEGRAM_MAX_LENGTH };
