import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, PlayCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { PRODUCT_FALLBACK_IMAGE } from './productsHelpers';
import './ProductMediaModal.css';

const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

function ProductMediaModal({ product, initialIndex = 0, onClose }) {
  const images =
    product.images && product.images.length > 0
      ? product.images.map(img => (typeof img === 'object' && img !== null ? img.url : img)).filter(Boolean)
      : product.image
        ? [product.image]
        : [PRODUCT_FALLBACK_IMAGE];

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const touchStart = useRef(null);
  const wrapperRef = useRef(null);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const next = Math.min(z + ZOOM_STEP, MAX_ZOOM);
      return next;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(z - ZOOM_STEP, MIN_ZOOM);
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    resetZoom();
  }, [currentIndex, resetZoom]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setCurrentIndex((i) => (i === images.length - 1 ? 0 : i + 1));
  }, [images.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  // Non-passive wheel + touch listeners on the wrapper
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (e) => {
      if (isVideo(images[currentIndex])) return;
      e.preventDefault();
      setZoom((z) => {
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        const next = Math.min(Math.max(z + delta, MIN_ZOOM), MAX_ZOOM);
        if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
        return next;
      });
    };

    const onTouchMove = (e) => {
      e.preventDefault();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [currentIndex, images]);

  // --- Mouse handlers ---
  const handleMouseDown = (e) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = (e.clientX - dragStart.current.x) / zoom;
    const dy = (e.clientY - dragStart.current.y) / zoom;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDoubleClick = () => {
    if (zoom > 1) resetZoom();
    else setZoom(2);
  };

  // --- Touch handlers ---
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStart.current = { type: 'pinch', dist, startZoom: zoom };
    } else if (e.touches.length === 1) {
      touchStart.current = {
        type: 'single',
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
        time: Date.now(),
      };
    }
  };

  const handleTouchMoveState = (e) => {
    if (!touchStart.current) return;

    if (e.touches.length === 2 && touchStart.current.type === 'pinch') {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / touchStart.current.dist;
      const next = Math.min(Math.max(touchStart.current.startZoom * scale, MIN_ZOOM), MAX_ZOOM);
      setZoom(next);
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && touchStart.current.type === 'single' && zoom > 1) {
      const dx = (e.touches[0].clientX - touchStart.current.x) / zoom;
      const dy = (e.touches[0].clientY - touchStart.current.y) / zoom;
      setPan({ x: touchStart.current.panX + dx, y: touchStart.current.panY + dy });
    }
  };

  const handleTouchEnd = (e) => {
    if (!touchStart.current || touchStart.current.type === 'pinch') {
      touchStart.current = null;
      return;
    }

    // Swipe to navigate when not zoomed
    if (zoom <= 1 && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
      const elapsed = Date.now() - touchStart.current.time;
      if (Math.abs(dx) > 50 && dy < 80 && elapsed < 400) {
        if (dx < 0) next();
        else prev();
      }
    }

    touchStart.current = null;
  };

  const currentIsVideo = isVideo(images[currentIndex]);

  return (
    <div className="pmm-overlay" onClick={onClose}>
      <div className="pmm-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pmm-header">
          <span className="pmm-title">{product.name}</span>
          {images.length > 1 && (
            <span className="pmm-counter">{currentIndex + 1} / {images.length}</span>
          )}
          {!currentIsVideo && (
            <div className="pmm-zoom-controls">
              <button className="pmm-zoom-btn" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
                <ZoomOut size={18} />
              </button>
              <span className="pmm-zoom-level">{zoom}×</span>
              <button className="pmm-zoom-btn" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
                <ZoomIn size={18} />
              </button>
            </div>
          )}
          <button className="pmm-close" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* Main media */}
        <div className="pmm-main">
          {images.length > 1 && (
            <button className="pmm-nav pmm-nav-prev" onClick={prev} aria-label="Previous">
              <ChevronLeft size={28} />
            </button>
          )}

          <div
            ref={wrapperRef}
            className="pmm-media-wrapper"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={!currentIsVideo ? handleDoubleClick : undefined}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMoveState}
            onTouchEnd={handleTouchEnd}
            style={{ cursor: currentIsVideo ? 'default' : zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          >
            {currentIsVideo ? (
              <video
                key={images[currentIndex]}
                src={images[currentIndex]}
                className="pmm-media"
                controls
                autoPlay
                muted
                loop
              />
            ) : (
              <img
                key={images[currentIndex]}
                src={images[currentIndex]}
                alt={`${product.name} ${currentIndex + 1}`}
                className="pmm-media"
                style={{
                  transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
                draggable={false}
                onError={(e) => { e.target.src = PRODUCT_FALLBACK_IMAGE; }}
              />
            )}
          </div>

          {images.length > 1 && (
            <button className="pmm-nav pmm-nav-next" onClick={next} aria-label="Next">
              <ChevronRight size={28} />
            </button>
          )}
        </div>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="pmm-thumbnails">
            {images.map((img, index) => (
              <div
                key={index}
                className={`pmm-thumb ${index === currentIndex ? 'pmm-thumb-active' : ''}`}
                onClick={() => setCurrentIndex(index)}
              >
                {isVideo(img) ? (
                  <>
                    <video src={img} className="pmm-thumb-media" />
                    <div className="pmm-thumb-play">
                      <PlayCircle size={18} color="white" />
                    </div>
                  </>
                ) : (
                  <img
                    src={img}
                    alt={`${product.name} ${index + 1}`}
                    className="pmm-thumb-media"
                    onError={(e) => { e.target.src = PRODUCT_FALLBACK_IMAGE; }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductMediaModal;
