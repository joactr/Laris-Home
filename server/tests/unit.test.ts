import { describe, expect, it } from 'vitest';
import { addDays, parseDateString, toDateString } from '../src/lib/dates';
import { isPrivateAddress } from '../src/lib/safe-fetch';

describe('dates', () => {
  it('toDateString does not shift the day (local constructor, no TZ)', () => {
    expect(toDateString(new Date(2026, 9, 22))).toBe('2026-10-22');
  });

  it('parseDateString returns day 22 in local time', () => {
    const d = parseDateString('2026-10-22');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(22);
  });

  it('addDays crosses months', () => {
    expect(toDateString(addDays(parseDateString('2026-10-31'), 1))).toBe('2026-11-01');
  });
});

describe('isPrivateAddress', () => {
  it.each(['10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1'])(
    'marks %s as private',
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );

  it.each(['::1', 'fd00::1'])('marks %s as private', (ip) =>
    expect(isPrivateAddress(ip)).toBe(true),
  );

  it.each(['8.8.8.8', '1.1.1.1'])('marks %s as public', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});
