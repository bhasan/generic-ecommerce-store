import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectBrandingTokens } from './useBrandingSSR';

describe('injectBrandingTokens', () => {
  beforeEach(() => {
    document.getElementById('brand-tokens-ssr')?.remove();
    while (document.head.firstChild) document.head.removeChild(document.head.firstChild);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects a style tag into document.head when the API returns CSS tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(':root {\n  --color-primary: #7c3aed;\n}'),
    }));

    await injectBrandingTokens();

    const tag = document.getElementById('brand-tokens-ssr');
    expect(tag).not.toBeNull();
    expect(tag.textContent).toContain('--color-primary: #7c3aed');
  });

  it('inserts the style tag as the first child of head', async () => {
    const existing = document.createElement('link');
    existing.rel = 'stylesheet';
    document.head.appendChild(existing);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(':root { --color-primary: #2563eb; }'),
    }));

    await injectBrandingTokens();

    expect(document.head.firstChild).toBe(document.getElementById('brand-tokens-ssr'));
  });

  it('does not inject a style tag when the API returns an empty :root block', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(':root {}'),
    }));

    await injectBrandingTokens();

    expect(document.getElementById('brand-tokens-ssr')).toBeNull();
  });

  it('does nothing when the API responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve(''),
    }));

    await injectBrandingTokens();

    expect(document.getElementById('brand-tokens-ssr')).toBeNull();
  });

  it('silently absorbs network errors without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));

    await expect(injectBrandingTokens()).resolves.toBeUndefined();
    expect(document.getElementById('brand-tokens-ssr')).toBeNull();
  });

  it('does not inject when CSS text is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    }));

    await injectBrandingTokens();

    expect(document.getElementById('brand-tokens-ssr')).toBeNull();
  });
});
