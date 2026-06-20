import { describe, it, expect } from 'vitest';
import { COLOR_PALETTES } from './colorPalettes';

const REQUIRED_TOKEN_KEYS = [
  'primary', 'primaryDark', 'primaryLight', 'primaryHover', 'primaryActive', 'primaryRgb',
  'secondary', 'secondaryDark', 'secondaryLight', 'secondaryHover', 'secondaryActive', 'secondaryRgb',
];

const HEX_RE = /^#[0-9a-f]{6}$/i;
const RGB_RE = /^\d{1,3} \d{1,3} \d{1,3}$/;

describe('COLOR_PALETTES', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(COLOR_PALETTES)).toBe(true);
    expect(COLOR_PALETTES.length).toBeGreaterThan(0);
  });

  it('every palette has a unique slug', () => {
    const slugs = COLOR_PALETTES.map(p => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every palette has a non-empty name', () => {
    for (const p of COLOR_PALETTES) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it('includes a "custom" palette with null tokens and null preview', () => {
    const custom = COLOR_PALETTES.find(p => p.slug === 'custom');
    expect(custom).toBeDefined();
    expect(custom.tokens).toBeNull();
    expect(custom.preview).toBeNull();
  });

  it('non-custom palettes have a valid preview hex color', () => {
    for (const p of COLOR_PALETTES.filter(p => p.slug !== 'custom')) {
      expect(HEX_RE.test(p.preview)).toBe(true);
    }
  });

  it('non-custom palettes include all required token keys', () => {
    for (const p of COLOR_PALETTES.filter(p => p.slug !== 'custom')) {
      for (const key of REQUIRED_TOKEN_KEYS) {
        expect(p.tokens).toHaveProperty(key);
      }
    }
  });

  it('non-custom palette hex tokens are valid 6-digit hex values', () => {
    const hexKeys = REQUIRED_TOKEN_KEYS.filter(k => !k.endsWith('Rgb'));
    for (const p of COLOR_PALETTES.filter(p => p.slug !== 'custom')) {
      for (const key of hexKeys) {
        expect(HEX_RE.test(p.tokens[key])).toBe(true);
      }
    }
  });

  it('non-custom palette RGB tokens are space-separated integers (no commas)', () => {
    const rgbKeys = REQUIRED_TOKEN_KEYS.filter(k => k.endsWith('Rgb'));
    for (const p of COLOR_PALETTES.filter(p => p.slug !== 'custom')) {
      for (const key of rgbKeys) {
        expect(RGB_RE.test(p.tokens[key])).toBe(true);
        expect(p.tokens[key]).not.toContain(',');
        const parts = p.tokens[key].split(' ').map(Number);
        expect(parts.every(n => n >= 0 && n <= 255)).toBe(true);
      }
    }
  });

  it('includes the purple-dark palette as first entry', () => {
    expect(COLOR_PALETTES[0].slug).toBe('purple-dark');
  });
});
