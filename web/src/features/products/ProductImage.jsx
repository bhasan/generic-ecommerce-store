import React from 'react';
import { PlayCircle } from 'lucide-react';
import { PRODUCT_FALLBACK_IMAGE } from './productsHelpers';

// Helper to check if a url is a video
const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

function ProductImage({ src, alt, className }) {
  const resolvedSrc = src || PRODUCT_FALLBACK_IMAGE;

  if (isVideo(resolvedSrc)) {
    return (
      <div className={`video-thumbnail-container ${className || ''}`} style={{ position: 'relative', width: '100%', height: '100$' }}>
        <video
          src={resolvedSrc}
          className={className}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        <div className="video-thumbnail-overlay" style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.3)', pointerEvents: 'none'
        }}>
          <PlayCircle size={32} color="white" opacity={0.8} />
        </div>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={(e) => {
        // Prevent infinite loop if the fallback image itself is missing
        if (e.target.src.includes(PRODUCT_FALLBACK_IMAGE)) {
          e.target.onerror = null;
        } else {
          e.target.src = PRODUCT_FALLBACK_IMAGE;
        }
      }}
    />
  );
}

export default ProductImage;
