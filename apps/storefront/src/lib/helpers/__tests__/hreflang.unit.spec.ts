import { describe, expect, it } from 'bun:test';
import {
  resolveXDefaultLocale,
  toHreflang,
} from '../hreflang';

describe('hreflang Turkey defaults (#180)', () => {
  it('maps tr to tr-TR', () => {
    expect(toHreflang('tr')).toBe('tr-TR');
  });

  it('defaults x-default locale to tr when available or when locales list is empty', () => {
    expect(resolveXDefaultLocale(['en', 'tr', 'de'])).toBe('tr');
    expect(resolveXDefaultLocale([])).toBe('tr');
  });

  it('falls back to us/gb or first available locale when tr is absent', () => {
    expect(resolveXDefaultLocale(['de', 'us'])).toBe('us');
    expect(resolveXDefaultLocale(['de', 'fr'])).toBe('de');
  });
});
