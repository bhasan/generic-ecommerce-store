import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './PromotionsCarousel.css';

const AUTO_ADVANCE_MS = 4000;

function PromotionsCarousel({ slides }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);

  const count = slides.length;

  const prev = useCallback(() => {
    setActiveIndex(i => (i - 1 + count) % count);
  }, [count]);

  const next = useCallback(() => {
    setActiveIndex(i => (i + 1) % count);
  }, [count]);

  // Auto-advance
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(next, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused, count, next]);

  // Keyboard nav
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  };

  // Touch swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) {
      delta > 0 ? next() : prev();
    }
    touchStartX.current = null;
  };

  if (!count) return null;

  const slide = slides[activeIndex];

  return (
    <div
      className="promo-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      tabIndex={0}
      role="region"
      aria-label="Promotions"
    >
      <div className="promo-slide">
        <img
          key={slide.url}
          src={slide.url}
          alt={slide.description || 'Promotion'}
          className="promo-image"
        />
        {slide.description && (
          <div className="promo-description">{slide.description}</div>
        )}
      </div>

      {count > 1 && (
        <>
          <button className="promo-nav promo-nav-prev" onClick={prev} aria-label="Previous slide">
            <ChevronLeft size={22} />
          </button>
          <button className="promo-nav promo-nav-next" onClick={next} aria-label="Next slide">
            <ChevronRight size={22} />
          </button>

          <div className="promo-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                className={`promo-dot ${i === activeIndex ? 'promo-dot--active' : ''}`}
                onClick={() => setActiveIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default PromotionsCarousel;
