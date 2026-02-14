import { describe, it, expect } from 'vitest';
import { calcWriteStats, calcEditStats, aggregateFileOps, type FileOperation } from '../src/services/file-sender.js';

describe('calcWriteStats', () => {
  it('counts lines in new content', () => {
    const result = calcWriteStats('line1\nline2\nline3');
    expect(result.insertions).toBe(3);
    expect(result.deletions).toBe(0);
  });

  it('handles single line', () => {
    const result = calcWriteStats('single line');
    expect(result.insertions).toBe(1);
    expect(result.deletions).toBe(0);
  });

  it('handles empty content', () => {
    const result = calcWriteStats('');
    expect(result.insertions).toBe(1);
    expect(result.deletions).toBe(0);
  });
});

describe('calcEditStats', () => {
  it('tracks replacements', () => {
    const result = calcEditStats('old line', 'new line');
    expect(result.insertions).toBe(1);
    expect(result.deletions).toBe(1);
  });

  it('tracks additions', () => {
    const result = calcEditStats('one', 'one\ntwo\nthree');
    expect(result.insertions).toBe(3);
    expect(result.deletions).toBe(1);
  });

  it('tracks multiline changes', () => {
    const result = calcEditStats('a\nb\nc', 'x\ny');
    expect(result.deletions).toBe(3);
    expect(result.insertions).toBe(2);
  });
});

describe('aggregateFileOps', () => {
  it('combines operations on same file', () => {
    const ops: FileOperation[] = [
      { type: 'edit', filePath: '/foo/bar.ts', insertions: 5, deletions: 2 },
      { type: 'edit', filePath: '/foo/bar.ts', insertions: 3, deletions: 1 },
    ];

    const result = aggregateFileOps(ops);
    expect(result).toHaveLength(1);
    expect(result[0].insertions).toBe(8);
    expect(result[0].deletions).toBe(3);
  });

  it('keeps different files separate', () => {
    const ops: FileOperation[] = [
      { type: 'write', filePath: '/a.ts', insertions: 10, deletions: 0 },
      { type: 'edit', filePath: '/b.ts', insertions: 2, deletions: 1 },
    ];

    const result = aggregateFileOps(ops);
    expect(result).toHaveLength(2);
  });

  it('marks as write if any op is write', () => {
    const ops: FileOperation[] = [
      { type: 'edit', filePath: '/foo.ts', insertions: 1, deletions: 1 },
      { type: 'write', filePath: '/foo.ts', insertions: 10, deletions: 0 },
    ];

    const result = aggregateFileOps(ops);
    expect(result[0].type).toBe('write');
  });
});
