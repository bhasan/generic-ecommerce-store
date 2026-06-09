import { beforeEach, describe, expect, it } from 'vitest';
import { applyBrandingTokens } from './colorUtils';

describe('applyBrandingTokens', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = '';
    document.getElementById('brand-tokens-ssr')?.remove();
  });

  it('sets all 12 CSS custom properties on :root', () => {
    applyBrandingTokens({
      primary: '#7c3aed',
      primaryDark: '#6b21a8',
      primaryLight: '#a855f7',
      primaryHover: '#9333ea',
      primaryActive: '#5b21b6',
      primaryRgb: '124 58 237',
      secondary: '#10b981',
      secondaryDark: '#059669',
      secondaryLight: '#34d399',
      secondaryHover: '#0ea572',
      secondaryActive: '#047857',
      secondaryRgb: '16 185 129',
    });

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-primary')).toBe('#7c3aed');
    expect(root.style.getPropertyValue('--color-primary-dark')).toBe('#6b21a8');
    expect(root.style.getPropertyValue('--color-primary-light')).toBe('#a855f7');
    expect(root.style.getPropertyValue('--color-primary-hover')).toBe('#9333ea');
    expect(root.style.getPropertyValue('--color-primary-active')).toBe('#5b21b6');
    expect(root.style.getPropertyValue('--color-primary-rgb')).toBe('124 58 237');
    expect(root.style.getPropertyValue('--color-secondary')).toBe('#10b981');
    expect(root.style.getPropertyValue('--color-secondary-dark')).toBe('#059669');
    expect(root.style.getPropertyValue('--color-secondary-rgb')).toBe('16 185 129');
  });

  it('skips undefined token values without throwing', () => {
    applyBrandingTokens({ primary: '#2563eb', secondary: '#059669' });

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-primary')).toBe('#2563eb');
    expect(root.style.getPropertyValue('--color-secondary')).toBe('#059669');
    expect(root.style.getPropertyValue('--color-primary-dark')).toBe('');
  });

  it('does nothing when called with null', () => {
    applyBrandingTokens(null);

    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('');
  });

  it('removes the brand-tokens-ssr style element after applying runtime tokens', () => {
    const style = document.createElement('style');
    style.id = 'brand-tokens-ssr';
    style.textContent = ':root { --color-primary: #old; }';
    document.head.appendChild(style);

    applyBrandingTokens({ primary: '#new', secondary: '#059669' });

    expect(document.getElementById('brand-tokens-ssr')).toBeNull();
  });

  it('does not throw when the brand-tokens-ssr element is absent', () => {
    expect(() => applyBrandingTokens({ primary: '#2563eb', secondary: '#059669' })).not.toThrow();
  });
});
