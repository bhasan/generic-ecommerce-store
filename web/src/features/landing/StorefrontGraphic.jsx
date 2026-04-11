import React, { useState } from 'react';
import './StorefrontGraphic.css';

export default function StorefrontGraphic() {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={`storefront-graphic-wrap ${isLoaded ? 'is-loaded' : 'is-loading'}`}>
      {!isLoaded && <div className="storefront-shimmer" />}
      <picture className={isLoaded ? 'visible' : 'hidden'}>
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
          onLoad={() => setIsLoaded(true)}
        />
      </picture>
    </div>
  );
}
