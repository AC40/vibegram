import { describe, it, expect } from 'vitest';
import { isPathSafe } from '../src/telegram/directory-browser.js';

describe('isPathSafe', () => {
  it('blocks /etc', () => {
    expect(isPathSafe('/etc')).toBe(false);
    expect(isPathSafe('/etc/passwd')).toBe(false);
  });

  it('blocks /root', () => {
    expect(isPathSafe('/root')).toBe(false);
    expect(isPathSafe('/root/.bashrc')).toBe(false);
  });

  it('blocks /var', () => {
    expect(isPathSafe('/var')).toBe(false);
    expect(isPathSafe('/var/log')).toBe(false);
  });

  it('blocks system directories', () => {
    expect(isPathSafe('/usr')).toBe(false);
    expect(isPathSafe('/bin')).toBe(false);
    expect(isPathSafe('/sbin')).toBe(false);
    expect(isPathSafe('/boot')).toBe(false);
    expect(isPathSafe('/dev')).toBe(false);
    expect(isPathSafe('/proc')).toBe(false);
    expect(isPathSafe('/sys')).toBe(false);
  });

  it('allows /tmp', () => {
    expect(isPathSafe('/tmp')).toBe(true);
    expect(isPathSafe('/tmp/test')).toBe(true);
  });

  it('blocks /root even if it is HOME (security)', () => {
    // When running as root, /root should still be blocked
    // This is intentional - the bot shouldn't run as root in production
    expect(isPathSafe('/root')).toBe(false);
  });

  it('blocks path traversal attempts', () => {
    const home = process.env['HOME'] ?? '/tmp';
    // These resolve outside allowed paths
    expect(isPathSafe('/tmp/../etc')).toBe(false);
    expect(isPathSafe(`${home}/../root`)).toBe(false);
  });
});
