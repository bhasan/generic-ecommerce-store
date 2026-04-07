import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import PromotionsCarousel from './PromotionsCarousel';

const slides = [
  { url: '/api/uploads/a.webp', description: 'First slide' },
  { url: '/api/uploads/b.webp', description: 'Second slide' },
  { url: '/api/uploads/c.webp', description: '' },
];

describe('PromotionsCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the first slide on mount', () => {
    render(<PromotionsCarousel slides={slides} />);
    expect(screen.getByAltText('First slide')).toBeInTheDocument();
    expect(screen.getByText('First slide')).toBeInTheDocument();
  });

  it('does not render when slides array is empty', () => {
    const { container } = render(<PromotionsCarousel slides={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not show prev/next buttons or dots for a single slide', () => {
    render(<PromotionsCarousel slides={[slides[0]]} />);
    expect(screen.queryByLabelText(/previous slide/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/next slide/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/go to slide/i)).not.toBeInTheDocument();
  });

  it('advances to the next slide when the next button is clicked', () => {
    render(<PromotionsCarousel slides={slides} />);

    fireEvent.click(screen.getByLabelText(/next slide/i));

    expect(screen.getByAltText('Second slide')).toBeInTheDocument();
    expect(screen.getByText('Second slide')).toBeInTheDocument();
  });

  it('goes to the previous slide when the prev button is clicked', () => {
    render(<PromotionsCarousel slides={slides} />);

    fireEvent.click(screen.getByLabelText(/previous slide/i));

    // wraps from index 0 to last slide
    expect(screen.getByAltText('')).toBeInTheDocument(); // slide 3 has empty description
  });

  it('jumps to the correct slide when a dot is clicked', () => {
    render(<PromotionsCarousel slides={slides} />);

    fireEvent.click(screen.getByLabelText('Go to slide 2'));

    expect(screen.getByText('Second slide')).toBeInTheDocument();
  });

  it('auto-advances after 4 seconds', () => {
    render(<PromotionsCarousel slides={slides} />);

    expect(screen.getByText('First slide')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(4000); });

    expect(screen.getByText('Second slide')).toBeInTheDocument();
  });

  it('does not auto-advance while hovered', () => {
    render(<PromotionsCarousel slides={slides} />);

    fireEvent.mouseEnter(screen.getByRole('region'));
    act(() => { vi.advanceTimersByTime(8000); });

    expect(screen.getByText('First slide')).toBeInTheDocument();
  });

  it('resumes auto-advance after mouse leaves', () => {
    render(<PromotionsCarousel slides={slides} />);

    fireEvent.mouseEnter(screen.getByRole('region'));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByText('First slide')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole('region'));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByText('Second slide')).toBeInTheDocument();
  });

  it('advances on ArrowRight key and goes back on ArrowLeft key', () => {
    render(<PromotionsCarousel slides={slides} />);
    const region = screen.getByRole('region');

    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByText('Second slide')).toBeInTheDocument();

    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByText('First slide')).toBeInTheDocument();
  });

  it('does not render a description overlay when description is empty', () => {
    render(<PromotionsCarousel slides={[{ url: '/api/uploads/x.webp', description: '' }]} />);
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  it('renders correct number of dot indicators', () => {
    render(<PromotionsCarousel slides={slides} />);
    expect(screen.getAllByLabelText(/go to slide/i)).toHaveLength(slides.length);
  });
});
