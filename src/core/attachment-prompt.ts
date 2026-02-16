import type { Attachment } from '../types/claude.js';

const TEXT_FILE_EXTENSIONS =
  /\.(ts|tsx|js|jsx|py|md|json|yaml|yml|toml|xml|html|css|sh|bash|txt|log|csv|sql|rs|go|java|c|cpp|h|hpp|rb|php)$/i;

function isTextDocument(attachment: Attachment): boolean {
  if (attachment.type !== 'document') return false;
  if (attachment.mimeType.startsWith('text/')) return true;
  if (!attachment.filename) return false;
  return TEXT_FILE_EXTENSIONS.test(attachment.filename);
}

function renderAttachment(attachment: Attachment): string {
  if (attachment.type === 'image') {
    const base64 = attachment.data.toString('base64');
    return `[Image attached as base64: data:${attachment.mimeType};base64,${base64}]`;
  }

  const filename = attachment.filename ?? 'document';
  if (isTextDocument(attachment)) {
    const content = attachment.data.toString('utf-8');
    return `File: ${filename}\n\`\`\`\n${content}\n\`\`\``;
  }

  return `[Binary document attached: ${filename}, ${attachment.data.length} bytes, type: ${attachment.mimeType}]`;
}

export function buildPromptWithAttachments(prompt: string, attachments: Attachment[] = []): string {
  if (attachments.length === 0) return prompt;
  const attachmentBlocks = attachments.map(renderAttachment).join('\n\n');
  return `${attachmentBlocks}\n\n${prompt}`;
}
