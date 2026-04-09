import React from 'react';
import './StorefrontGraphic.css';

export default function StorefrontGraphic() {
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
          alt="Smoke Station interior"
          width="2240"
          height="1091"
          fetchPriority="high"
          className="storefront-graphic"
        />
      </picture>
    </div>
  );
}
