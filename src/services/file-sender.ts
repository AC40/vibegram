import { type Api, InputFile } from 'grammy';
import { readFile, stat } from 'fs/promises';
import { basename, extname } from 'path';
import { generateCodePreview, isCodeFile } from './code-preview.js';
import { postfixEmoji } from '../telegram/renderer.js';
import { logger } from '../utils/logger.js';

const MAX_PREVIEW_SIZE = 100 * 1024; // 100KB - files larger than this skip preview
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB Telegram limit

export interface FileOperation {
  type: 'write' | 'edit';
  filePath: string;
}

export async function sendFileToTelegram(
  api: Api,
  chatId: number,
  operation: FileOperation,
  sessionEmoji: string
): Promise<void> {
  const { filePath, type } = operation;

  try {
    const fileStat = await stat(filePath);

    if (fileStat.size > MAX_FILE_SIZE) {
      await api.sendMessage(
        chatId,
        postfixEmoji(`📁 File too large to send: ${filePath} (${formatSize(fileStat.size)})`, sessionEmoji)
      );
      return;
    }

    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const filename = basename(filePath);
    const actionVerb = type === 'write' ? 'Created' : 'Updated';

    // For code files under the preview size limit, generate syntax-highlighted preview
    if (isCodeFile(ext) && fileStat.size < MAX_PREVIEW_SIZE) {
      const preview = await generateCodePreview(content.toString('utf-8'), ext, filename);

      if (preview) {
        // Send preview image
        await api.sendPhoto(chatId, new InputFile(preview, `${filename}.png`), {
          caption: postfixEmoji(`📄 ${actionVerb}: ${filePath}`, sessionEmoji),
        });

        // Also send as document for copying
        await api.sendDocument(chatId, new InputFile(content, filename), {
          caption: postfixEmoji('📎 Source file', sessionEmoji),
        });
        return;
      }
    }

    // Fallback: send as document only
    await api.sendDocument(chatId, new InputFile(content, filename), {
      caption: postfixEmoji(`📁 ${actionVerb}: ${filePath}`, sessionEmoji),
    });
  } catch (error) {
    // File might not exist (e.g., deleted after being created)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug({ filePath }, 'File no longer exists, skipping send');
      return;
    }
    logger.error({ error, filePath }, 'Failed to send file to Telegram');
    throw error;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
