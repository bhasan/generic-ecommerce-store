import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme, THEME_CYCLE } from './useTheme';

describe('useTheme', () => {
  let matchMediaMock;

  beforeEach(() => {
    localStorage.clear();
    matchMediaMock = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMediaMock);
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to system theme when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });

  it('reads persisted preference from localStorage on mount', () => {
    localStorage.setItem('theme-preference', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('sets data-theme attribute on documentElement when theme changes', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists theme choice to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    expect(localStorage.getItem('theme-preference')).toBe('light');
  });

  it('resolves system preference to light when OS prefers light', () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    localStorage.setItem('theme-preference', 'system');
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('resolves system preference to dark when OS prefers dark', () => {
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    localStorage.setItem('theme-preference', 'system');
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('registers a media query listener when theme is system', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: addListener,
      removeEventListener: removeListener,
    });

    const { unmount } = renderHook(() => useTheme());
    expect(addListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('does not register a media query listener when theme is not system', () => {
    localStorage.setItem('theme-preference', 'dark');
    const addListener = vi.fn();
    matchMediaMock.mockReturnValue({ matches: false, addEventListener: addListener, removeEventListener: vi.fn() });
    renderHook(() => useTheme());
    expect(addListener).not.toHaveBeenCalled();
  });
});

describe('THEME_CYCLE', () => {
  it('cycles dark → light → system → dark', () => {
    expect(THEME_CYCLE.dark).toBe('light');
    expect(THEME_CYCLE.light).toBe('system');
    expect(THEME_CYCLE.system).toBe('dark');
  });
});
