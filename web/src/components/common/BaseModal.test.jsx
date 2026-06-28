import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BaseModal, { ModalHeader, ModalFooter } from './BaseModal';

describe('BaseModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <BaseModal isOpen={false} onClose={() => {}}>
        <p>Content</p>
      </BaseModal>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders children when isOpen is true', () => {
    render(
      <BaseModal isOpen={true} onClose={() => {}}>
        <p>Modal content</p>
      </BaseModal>
    );
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BaseModal isOpen={true} onClose={onClose}>
        <p>Content</p>
      </BaseModal>
    );
    const overlay = container.querySelector('.modal-overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when modal container is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BaseModal isOpen={true} onClose={onClose}>
        <p>Content</p>
      </BaseModal>
    );
    const modalContainer = container.querySelector('.modal-container');
    fireEvent.click(modalContainer);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <BaseModal isOpen={true} onClose={onClose}>
        <p>Content</p>
      </BaseModal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll when open', () => {
    render(
      <BaseModal isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </BaseModal>
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', () => {
    const { rerender } = render(
      <BaseModal isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </BaseModal>
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <BaseModal isOpen={false} onClose={() => {}}>
        <p>Content</p>
      </BaseModal>
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('has aria-modal and role="dialog" on the container', () => {
    const { container } = render(
      <BaseModal isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </BaseModal>
    );
    const modalContainer = container.querySelector('.modal-container');
    expect(modalContainer).toHaveAttribute('role', 'dialog');
    expect(modalContainer).toHaveAttribute('aria-modal', 'true');
  });
});

describe('ModalHeader', () => {
  it('renders title, subtitle, icon, and close button', () => {
    const onClose = vi.fn();
    render(
      <ModalHeader
        title="Test Title"
        subtitle="Test Subtitle"
        icon={<span data-testid="icon">Icon</span>}
        onClose={onClose}
      />
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('does not render close button when onClose is not provided', () => {
    render(<ModalHeader title="Test Title" />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

describe('ModalFooter', () => {
  it('renders children', () => {
    render(
      <ModalFooter>
        <button>Save</button>
        <button>Cancel</button>
      </ModalFooter>
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
