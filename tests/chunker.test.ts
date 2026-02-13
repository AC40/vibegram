import { describe, it, expect } from 'vitest';
import { chunkText, SAFE_LIMIT } from '../src/telegram/chunker.js';

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const text = 'Hello, world!';
    const result = chunkText(text);
    expect(result).toEqual([text]);
  });

  it('returns single chunk when text equals limit', () => {
    const text = 'a'.repeat(SAFE_LIMIT);
    const result = chunkText(text);
    expect(result).toEqual([text]);
  });

  it('splits long text into multiple chunks', () => {
    const text = 'a'.repeat(SAFE_LIMIT + 100);
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
    expect(result.join('')).toBe(text);
  });

  it('prefers splitting at newlines', () => {
    const line1 = 'a'.repeat(2000);
    const line2 = 'b'.repeat(2000);
    const text = `${line1}\n${line2}`;

    const result = chunkText(text);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(line1);
    expect(result[1]).toBe(line2);
  });

  it('splits at spaces when newline is too far back', () => {
    const words = Array(1000).fill('word').join(' ');
    const result = chunkText(words);

    expect(result.length).toBeGreaterThan(1);
    // Each chunk should end cleanly (not mid-word)
    for (const chunk of result.slice(0, -1)) {
      expect(chunk.endsWith('word')).toBe(true);
    }
  });

  it('handles custom limit', () => {
    const text = 'a'.repeat(200);
    const result = chunkText(text, 100);
    expect(result.length).toBe(2);
    expect(result[0].length).toBe(100);
    expect(result[1].length).toBe(100);
  });

  it('handles empty string', () => {
    const result = chunkText('');
    expect(result).toEqual(['']);
  });

  it('trims whitespace from start of subsequent chunks', () => {
    const text = 'hello world '.repeat(400);
    const result = chunkText(text);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].startsWith(' ')).toBe(false);
    }
  });
});
