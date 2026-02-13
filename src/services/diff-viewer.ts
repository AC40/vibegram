import { createHighlighter, type Highlighter } from 'shiki';
import { Resvg } from '@resvg/resvg-js';
import { logger } from '../utils/logger.js';

let highlighter: Highlighter | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: ['diff'],
    });
  }
  return highlighter;
}

export async function generateDiffPreview(diff: string): Promise<Buffer | null> {
  try {
    const hl = await getHighlighter();

    // Limit diff size for preview
    const allLines = diff.split('\n');
    const lines = allLines.slice(0, 50);
    const truncated = allLines.length > 50;
    const previewDiff = lines.join('\n') + (truncated ? '\n... (truncated)' : '');

    const html = hl.codeToHtml(previewDiff, {
      lang: 'diff',
      theme: 'github-dark',
    });

    const svg = diffToSvg(html, lines.length + (truncated ? 1 : 0));
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: 800,
      },
    });
    const png = resvg.render().asPng();

    return Buffer.from(png);
  } catch (error) {
    logger.warn({ error }, 'Failed to generate diff preview');
    return null;
  }
}

function diffToSvg(html: string, lineCount: number): string {
  const width = 800;
  const lineHeight = 18;
  const padding = 40;
  const headerHeight = 30;
  const height = Math.min(800, lineCount * lineHeight + padding * 2 + headerHeight);

  // Extract the code content from shiki HTML
  const codeMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  const codeContent = codeMatch?.[1] ?? html;

  // Convert to SVG-safe text
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

  const lines = textContent.split('\n');
  const textElements = lines.map((line, i) => {
    const y = headerHeight + padding + (i + 1) * lineHeight;
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
  <text class="header" x="${padding}" y="24">Changes</text>
  ${textElements}
</svg>`;
}

export function formatDiffText(diff: string): string {
  const lines = diff.split('\n').map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return `🟢 ${line}`;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      return `🔴 ${line}`;
    } else if (line.startsWith('@@')) {
      return `📍 ${line}`;
    }
    return line;
  });
  return lines.join('\n');
}
