import type { BotContext } from '../bot.js';
import { MAX_DOCUMENT_SIZE_BYTES } from '../constants.js';

export class FileTooLargeError extends Error {
  constructor(public readonly size: number, public readonly maxSize: number) {
    super(`File too large: ${formatBytes(size)} exceeds limit of ${formatBytes(maxSize)}`);
    this.name = 'FileTooLargeError';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function downloadFile(ctx: BotContext, fileId: string, maxSize: number = MAX_DOCUMENT_SIZE_BYTES): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);

  // Check file size before downloading
  if (file.file_size && file.file_size > maxSize) {
    throw new FileTooLargeError(file.file_size, maxSize);
  }

  const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Double-check size after download (in case file_size wasn't reported)
  if (buffer.length > maxSize) {
    throw new FileTooLargeError(buffer.length, maxSize);
  }

  return buffer;
}
