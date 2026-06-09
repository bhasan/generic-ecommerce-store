import prisma from '../config/database';

export interface ColorTokens {
  primary: string;
  primaryDark?: string;
  primaryLight?: string;
  primaryHover?: string;
  primaryActive?: string;
  primaryRgb?: string;
  secondary: string;
  secondaryDark?: string;
  secondaryLight?: string;
  secondaryHover?: string;
  secondaryActive?: string;
  secondaryRgb?: string;
}

export interface BrandingSettings {
  storeName: string;
  tagline: string;
  logoUrl: string;
  heroImageUrl: string;
  faviconUrls: { '16': string; '32': string; '180': string };
  palette: string;
  customColors: ColorTokens | null;
}

const DEFAULT_BRANDING: BrandingSettings = {
  storeName: '',
  tagline: '',
  logoUrl: '',
  heroImageUrl: '',
  faviconUrls: { '16': '', '32': '', '180': '' },
  palette: 'purple-dark',
  customColors: null,
};

export class BrandingService {
  async getBranding(): Promise<BrandingSettings> {
    const row = await prisma.uiSetting.findUnique({ where: { key: 'branding' } });
    if (!row) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...(row.value as Partial<BrandingSettings>) };
  }

  async updateBranding(data: Partial<BrandingSettings>): Promise<BrandingSettings> {
    const current = await this.getBranding();
    const merged: BrandingSettings = { ...current, ...data };

    if (merged.customColors) {
      const c = merged.customColors;
      if (c.primary && /^#[0-9a-f]{6}$/i.test(c.primary)) {
        const primaryTokens = this.computeColorVariants(c.primary, 'primary');
        merged.customColors = { ...merged.customColors, ...primaryTokens };
      }
      if (c.secondary && /^#[0-9a-f]{6}$/i.test(c.secondary)) {
        const secondaryTokens = this.computeColorVariants(c.secondary, 'secondary');
        merged.customColors = { ...merged.customColors, ...secondaryTokens };
      }
    }

    const row = await prisma.uiSetting.upsert({
      where: { key: 'branding' },
      update: { value: merged as object },
      create: { key: 'branding', value: merged as object },
    });

    return { ...DEFAULT_BRANDING, ...(row.value as Partial<BrandingSettings>) };
  }

  async generateCssBlock(): Promise<string> {
    const branding = await this.getBranding();
    const c = branding.customColors;
    if (!c) return ':root {}';

    const HEX = /^#[0-9a-f]{6}$/i;
    const RGB = /^\d{1,3} \d{1,3} \d{1,3}$/;
    const isSafe = (k: string, v: string) => k.endsWith('-rgb') ? RGB.test(v) : HEX.test(v);

    const entries: Array<[string, string | undefined]> = [
      ['--color-primary', c.primary],
      ['--color-primary-dark', c.primaryDark],
      ['--color-primary-light', c.primaryLight],
      ['--color-primary-hover', c.primaryHover],
      ['--color-primary-active', c.primaryActive],
      ['--color-primary-rgb', c.primaryRgb],
      ['--color-secondary', c.secondary],
      ['--color-secondary-dark', c.secondaryDark],
      ['--color-secondary-light', c.secondaryLight],
      ['--color-secondary-hover', c.secondaryHover],
      ['--color-secondary-active', c.secondaryActive],
      ['--color-secondary-rgb', c.secondaryRgb],
    ];
    const lines = entries
      .filter((entry): entry is [string, string] => !!entry[1] && isSafe(entry[0], entry[1]))
      .map(([k, v]) => `  ${k}: ${v};`);
    if (!lines.length) return ':root {}';
    return `:root {\n${lines.join('\n')}\n}`;
  }

  computeColorVariants(hex: string, prefix: 'primary' | 'secondary' = 'primary'): Partial<ColorTokens> {
    const [r, g, b] = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const toHex = (r: number, g: number, b: number) => {
      const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
      return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
    };
    const adjustL = (r: number, g: number, b: number, delta: number) => {
      const rf = r / 255, gf = g / 255, bf = b / 255;
      const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
      let h = 0, s = 0, l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rf: h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6; break;
          case gf: h = ((bf - rf) / d + 2) / 6; break;
          default: h = ((rf - gf) / d + 4) / 6;
        }
      }
      l = Math.max(0, Math.min(1, l + delta));
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      return [
        Math.round(hue2rgb(p, q, h + 1/3) * 255),
        Math.round(hue2rgb(p, q, h) * 255),
        Math.round(hue2rgb(p, q, h - 1/3) * 255),
      ];
    };
    const [dr, dg, db] = adjustL(r, g, b, -0.15);
    const [lr, lg, lb] = adjustL(r, g, b, 0.15);
    const [hr, hg, hb] = adjustL(r, g, b, 0.08);
    const [ar, ag, ab] = adjustL(r, g, b, -0.20);

    if (prefix === 'primary') {
      return {
        primary: hex,
        primaryDark: toHex(dr, dg, db),
        primaryLight: toHex(lr, lg, lb),
        primaryHover: toHex(hr, hg, hb),
        primaryActive: toHex(ar, ag, ab),
        primaryRgb: `${r} ${g} ${b}`,
      };
    }
    return {
      secondary: hex,
      secondaryDark: toHex(dr, dg, db),
      secondaryLight: toHex(lr, lg, lb),
      secondaryHover: toHex(hr, hg, hb),
      secondaryActive: toHex(ar, ag, ab),
      secondaryRgb: `${r} ${g} ${b}`,
    };
  }
}
