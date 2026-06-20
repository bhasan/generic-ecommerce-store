import { useApp } from '../../context/AppContext';
import './StorefrontGraphic.css';

export default function StorefrontGraphic() {
  const { branding } = useApp();
  const heroUrl = branding?.heroImageUrl;

  if (heroUrl) {
    return (
      <div className="storefront-graphic-wrap">
        <picture>
          <img
            src={heroUrl}
            alt={branding?.storeName || 'Store'}
            className="storefront-graphic"
            fetchPriority="high"
          />
        </picture>
      </div>
    );
  }

  return (
    <div className="storefront-graphic-wrap">
      <picture>
        <source
          type="image/webp"
          srcSet="/images/storefront-1x.webp 1120w, /images/storefront-2x.webp 2240w"
          sizes="(max-width: 1120px) 100vw, 1120px"
        />
        <img
          src="/images/storefront-2x.webp"
          alt="Store interior"
          width="2240"
          height="1091"
          fetchPriority="high"
          className="storefront-graphic"
        />
      </picture>
    </div>
  );
}
