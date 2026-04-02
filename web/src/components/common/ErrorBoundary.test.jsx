import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('ErrorBoundary', () => {
  it('renders fallback UI when child throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: ErrorBoundary } = await import('./ErrorBoundary');

    const ProblemChild = () => {
      throw new Error('boom');
    };

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
