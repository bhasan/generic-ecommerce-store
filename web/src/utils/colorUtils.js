const TOKEN_MAP = {
  '--color-primary': 'primary',
  '--color-primary-dark': 'primaryDark',
  '--color-primary-light': 'primaryLight',
  '--color-primary-hover': 'primaryHover',
  '--color-primary-active': 'primaryActive',
  '--color-primary-rgb': 'primaryRgb',
  '--color-secondary': 'secondary',
  '--color-secondary-dark': 'secondaryDark',
  '--color-secondary-light': 'secondaryLight',
  '--color-secondary-hover': 'secondaryHover',
  '--color-secondary-active': 'secondaryActive',
  '--color-secondary-rgb': 'secondaryRgb',
};

export function applyBrandingTokens(customColors) {
  if (!customColors) return;
  const root = document.documentElement;
  for (const [cssVar, key] of Object.entries(TOKEN_MAP)) {
    const value = customColors[key];
    if (value) root.style.setProperty(cssVar, value);
  }
  const ssr = document.getElementById('brand-tokens-ssr');
  if (ssr) ssr.remove();
}
