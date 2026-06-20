export async function injectBrandingTokens() {
  try {
    const res = await fetch('/api/branding/css');
    if (!res.ok) return;
    const css = await res.text();
    if (!css || css.trim() === ':root {}') return;
    const style = document.createElement('style');
    style.id = 'brand-tokens-ssr';
    style.textContent = css;
    document.head.insertBefore(style, document.head.firstChild);
  } catch {
    // Silent fail — theme.css defaults take over
  }
}
