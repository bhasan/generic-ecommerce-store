import { useApp } from '../../context/AppContext';

export default function StorefrontGraphic() {
  const { branding } = useApp();
  const heroUrl = branding?.heroImageUrl;

  if (heroUrl) {
    return (
      <div className="storefront-graphic">
        <img src={heroUrl} alt={branding?.storeName || 'Store'} className="storefront-hero-custom" style={{ width: '100%', maxHeight: 400, objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <picture>
      <source srcSet="/images/storefront-1x.webp 1120w, /images/storefront-2x.webp 2240w" />
      <img src="/images/storefront-2x.webp" alt="Store interior" width="2240" height="1091" />
    </picture>
  );
}
