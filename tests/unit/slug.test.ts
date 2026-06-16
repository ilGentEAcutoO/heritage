import { describe, it, expect } from 'vitest';
import { slugify, isValidSlug, SLUG_REGEX } from '../../src/app/lib/slug';

describe('slugify', () => {
  it('lowercases and hyphenates a latin name', () => {
    expect(slugify('My Family')).toBe('my-family');
    expect(slugify('Wongsuriya Family')).toBe('wongsuriya-family');
  });

  it('collapses runs of non-alphanumerics and trims hyphens', () => {
    expect(slugify('  The   Smiths!! ')).toBe('the-smiths');
    expect(slugify('A & B / C')).toBe('a-b-c');
  });

  it('keeps digits and allows a leading digit', () => {
    expect(slugify('2024 Reunion')).toBe('2024-reunion');
  });

  it('returns "" for all-Thai names (no usable ASCII)', () => {
    expect(slugify('บ้านวงศ์สุริยา')).toBe('');
  });

  it('returns "" when the result would be too short (< 2 chars)', () => {
    expect(slugify('A')).toBe('');
    expect(slugify('!')).toBe('');
  });

  it('does not emit a trailing hyphen even when sliced at 64 chars on a boundary', () => {
    const s = slugify('a'.repeat(63) + ' bbb'); // collapses to <63chars>-bbb, slice cuts after the hyphen
    expect(s.endsWith('-')).toBe(false);
    expect(isValidSlug(s)).toBe(true);
  });

  it('always yields a string that passes isValidSlug or is empty', () => {
    for (const n of ['My Family', '2024 Reunion', 'a-b', 'บ้าน', 'X']) {
      const s = slugify(n);
      expect(s === '' || isValidSlug(s)).toBe(true);
    }
  });
});

describe('isValidSlug / SLUG_REGEX (mirrors server)', () => {
  it('accepts valid slugs', () => {
    expect(isValidSlug('my-family')).toBe(true);
    expect(isValidSlug('a1')).toBe(true);
    expect(isValidSlug('2024-reunion')).toBe(true);
  });

  it('rejects leading hyphen, uppercase, too-short, and bad chars', () => {
    expect(isValidSlug('-nope')).toBe(false);
    expect(isValidSlug('Nope')).toBe(false);
    expect(isValidSlug('a')).toBe(false); // < 2 chars
    expect(isValidSlug('a_b')).toBe(false);
    expect(isValidSlug('ครอบครัว')).toBe(false);
  });

  it('rejects > 64 chars', () => {
    expect(isValidSlug('a'.repeat(65))).toBe(false);
    expect(isValidSlug('a'.repeat(64))).toBe(true);
  });

  it('SLUG_REGEX is exported and matches the server pattern', () => {
    expect(SLUG_REGEX.source).toBe('^[a-z0-9][a-z0-9-]{1,63}$');
  });
});
