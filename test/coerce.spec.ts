import { describe, it, expect } from 'vitest';
import { num, str, bool } from '../src/lib/coerce.js';

describe('num', () => {
  it('parses numeric strings and numbers, else null', () => {
    expect(num(42)).toBe(42);
    expect(num('42.5')).toBe(42.5);
    expect(num('')).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num('abc')).toBeNull();
    expect(num(Number.NaN)).toBeNull();
  });
});

describe('str', () => {
  it('trims, caps length, non-strings → null', () => {
    expect(str('  hi ')).toBe('hi');
    expect(str('', 10)).toBeNull();
    expect(str(123 as unknown)).toBeNull();
    expect(str('abcdef', 3)).toBe('abc');
  });
});

describe('bool', () => {
  it('coerces truthiness', () => {
    expect(bool(true)).toBe(true);
    expect(bool('x')).toBe(true);
    expect(bool(0)).toBe(false);
    expect(bool(undefined)).toBe(false);
  });
});
