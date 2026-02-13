import { createHighlighter, type Highlighter } from 'shiki';
import { Resvg } from '@resvg/resvg-js';
import { logger } from '../utils/logger.js';

let highlighter: Highlighter | null = null;

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.sql': 'sql',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.md': 'markdown',
  '.txt': 'text',
};

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: ['typescript', 'tsx', 'javascript', 'jsx', 'python', 'rust', 'go', 'java', 'c', 'cpp', 'ruby', 'php', 'bash', 'sql', 'json', 'yaml', 'toml', 'xml', 'html', 'css', 'scss', 'markdown', 'text', 'diff'],
    });
  }
  return highlighter;
}

export async function generateCodePreview(
  code: string,
  ext: string,
  filename: string
): Promise<Buffer | null> {
  try {
    const hl = await getHighlighter();
    const lang = LANG_MAP[ext.toLowerCase()] ?? 'text';

    // Limit lines for preview
    const allLines = code.split('\n');
    const lines = allLines.slice(0, 40);
    const truncated = allLines.length > 40;
    const previewCode = lines.join('\n') + (truncated ? '\n// ... (truncated)' : '');

    const html = hl.codeToHtml(previewCode, {
      lang,
      theme: 'github-dark',
    });

    // Convert HTML to SVG to PNG
    const svg = htmlToSvg(html, filename, lines.length + (truncated ? 1 : 0));
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: 800,
      },
    });
    const png = resvg.render().asPng();

    return Buffer.from(png);
  } catch (error) {
    logger.warn({ error, ext, filename }, 'Failed to generate code preview');
    return null;
  }
}

function htmlToSvg(html: string, filename: string, lineCount: number): string {
  const width = 800;
  const lineHeight = 18;
  const padding = 40;
  const headerHeight = 30;
  const height = Math.min(800, lineCount * lineHeight + padding * 2 + headerHeight);

  // Extract the code content from shiki HTML and escape for SVG
  const codeMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  const codeContent = codeMatch?.[1] ?? html;

  // Simple HTML to text conversion for SVG (shiki produces styled spans)
  const textContent = codeContent
    .replace(/<span[^>]*style="color:#([^"]+)"[^>]*>/g, '<tspan fill="#$1">')
    .replace(/<span[^>]*>/g, '<tspan>')
    .replace(/<\/span>/g, '</tspan>')
    .replace(/<code[^>]*>/g, '')
    .replace(/<\/code>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');

  // Split into lines and create text elements
  const lines = textContent.split('\n');
  const textElements = lines.map((line, i) => {
    const y = headerHeight + padding + (i + 1) * lineHeight;
    // Clean up any remaining HTML for safety
    const safeLine = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<text x="${padding}" y="${y}" class="code">${safeLine}</text>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <style>
      .bg { fill: #0d1117; }
      .header { fill: #8b949e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 12px; }
      .code { fill: #c9d1d9; font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Monaco, Consolas, monospace; font-size: 13px; }
    </style>
  </defs>
  <rect class="bg" width="100%" height="100%" rx="8"/>
  <text class="header" x="${padding}" y="24">${escapeXml(filename)}</text>
  ${textElements}
</svg>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function isCodeFile(ext: string): boolean {
  return ext.toLowerCase() in LANG_MAP;
}
