import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProgressiveReveal } from './useProgressiveReveal';

// ── IntersectionObserver mock ──────────────────────────────────────────────

let observerCallback = null;
let observerInstance = null;

const MockIntersectionObserver = vi.fn((callback) => {
  observerCallback = callback;
  observerInstance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
  };
  return observerInstance;
});

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  observerCallback = null;
  observerInstance = null;
  MockIntersectionObserver.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper: fire the observer callback with isIntersecting value
const fireIntersection = (isIntersecting) => {
  act(() => {
    observerCallback([{ isIntersecting }]);
  });
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useProgressiveReveal', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

  it('starts with visibleCount equal to step', () => {
    const { result } = renderHook(() => useProgressiveReveal(items, 4));
    expect(result.current.visibleCount).toBe(4);
  });

  it('uses default step of 4', () => {
    const { result } = renderHook(() => useProgressiveReveal(items));
    expect(result.current.visibleCount).toBe(4);
  });

  it('increments visibleCount by step when sentinel is intersecting', () => {
    const { result } = renderHook(() => useProgressiveReveal(items, 4));

    // Attach sentinel ref to a dummy node so the observer is created
    const node = document.createElement('div');
    act(() => {
      result.current.sentinelRef(node);
    });

    expect(observerInstance.observe).toHaveBeenCalledWith(node);

    fireIntersection(true);
    expect(result.current.visibleCount).toBe(8);

    fireIntersection(true);
    expect(result.current.visibleCount).toBe(12);
  });

  it('does not increment when isIntersecting is false', () => {
    const { result } = renderHook(() => useProgressiveReveal(items, 4));

    const node = document.createElement('div');
    act(() => {
      result.current.sentinelRef(node);
    });

    fireIntersection(false);
    expect(result.current.visibleCount).toBe(4);
  });

  it('resets visibleCount to step when items change', () => {
    const items1 = ['a', 'b', 'c', 'd', 'e', 'f'];
    const items2 = ['x', 'y', 'z'];

    const { result, rerender } = renderHook(
      ({ items }) => useProgressiveReveal(items, 4),
      { initialProps: { items: items1 } }
    );

    // Attach sentinel and fire intersection to advance count
    const node = document.createElement('div');
    act(() => {
      result.current.sentinelRef(node);
    });
    fireIntersection(true);
    expect(result.current.visibleCount).toBe(8);

    // Change items
    act(() => {
      rerender({ items: items2 });
    });

    expect(result.current.visibleCount).toBe(4);
  });

  it('disconnects old observer when sentinelRef is called with null', () => {
    const { result } = renderHook(() => useProgressiveReveal(items, 4));

    const node = document.createElement('div');
    act(() => {
      result.current.sentinelRef(node);
    });
    const firstInstance = observerInstance;

    act(() => {
      result.current.sentinelRef(null);
    });

    expect(firstInstance.disconnect).toHaveBeenCalled();
  });
});
