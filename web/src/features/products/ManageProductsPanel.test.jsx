import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManageProductsPanel from './ManageProductsPanel';
import { ROLES } from '../../utils/roles';
import { UNSUPPORTED_MEDIA_MESSAGE } from '../../utils/mediaUpload';

const useAppMock = vi.fn();
const uploadFileMock = vi.fn();
const uploadFilesMock = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

vi.mock('../../services/uploadApi', () => ({
  uploadFile: (...args) => uploadFileMock(...args),
  uploadFiles: (...args) => uploadFilesMock(...args),
}));

vi.mock('./ProductsHeader', () => ({
  default: ({ title, rightContent }) => (
    <div>
      <h1>{title}</h1>
      <div>{rightContent}</div>
    </div>
  ),
}));

vi.mock('../../components/common/ConfirmationModal', () => ({
  default: () => null,
}));

vi.mock('../../components/common/MediaLibraryModal', () => ({
  default: () => null,
}));

vi.mock('../../components/common/EmptyState', () => ({
  default: ({ message }) => <div>{message}</div>,
}));

vi.mock('./ProductImage', () => ({
  default: () => null,
}));

vi.mock('../dashboard/components/CategoriesSection', () => ({
  default: () => <div>CategoriesSection</div>,
}));

vi.mock('./ProductFormModal', () => ({
  default: ({
    isOpen,
    formData,
    setFormData,
    onSave,
    onCancel,
    handleImageUpload,
    imageInputAccept,
    mediaInputAccept,
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="product-form-modal">
        <button
          type="button"
          onClick={() =>
            setFormData({
              ...formData,
              name: 'Test Product',
              categoryId: '1',
              variants: [
                {
                  label: 'Default',
                  sku: '',
                  pricingMode: 'UNIT',
                  basePrice: '12.50',
                  stock: '0',
                  stockEnabled: false,
                  isDefault: true,
                  active: true,
                  quantityOptions: [],
                  priceBreaks: [],
                },
              ],
            })
          }
        >
          Set Valid Form
        </button>
        <input
          data-testid="thumbnail-upload"
          type="file"
          accept={imageInputAccept}
          onChange={(event) => handleImageUpload('thumbnail', event)}
        />
        <input
          data-testid="gallery-upload"
          type="file"
          accept={mediaInputAccept}
          multiple
          onChange={(event) => handleImageUpload(0, event)}
        />
        <div data-testid="thumbnail-state">{formData.thumbnail || ''}</div>
        <div data-testid="images-state">{(formData.images || []).map(img => img?.url || img).join('|')}</div>
        <button type="button" onClick={onSave}>Save Product</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    );
  },
}));

vi.mock('../../components/common/ImageCropModal', () => ({
  default: ({ file, onSkip, onCancel }) => (
    <div data-testid="crop-modal">
      <span>{file?.name}</span>
      <button type="button" onClick={() => onSkip(file)}>Skip Upload</button>
      <button type="button" onClick={onCancel}>Cancel Crop</button>
    </div>
  ),
}));

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createAppState = (overrides = {}) => ({
  currentUser: { id: 1, username: 'manager', roles: [ROLES.MANAGEMENT] },
  products: [],
  isLoadingProducts: false,
  loadProducts: vi.fn(),
  addProduct: vi.fn().mockResolvedValue({ id: 1 }),
  updateProduct: vi.fn().mockResolvedValue({ id: 1 }),
  deleteProduct: vi.fn(),
  categories: [{ id: 1, name: 'Flower' }],
  isLoadingCategories: false,
  loadCategories: vi.fn(),
  showNotification: vi.fn(),
  ...overrides,
});

const openAddForm = async () => {
  fireEvent.click(screen.getByText('Add New Product'));
  await screen.findByTestId('product-form-modal');
};

describe('ManageProductsPanel upload handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadFileMock.mockResolvedValue({ url: '/api/uploads/uploaded.webp' });
    uploadFilesMock.mockResolvedValue({
      urls: ['/api/uploads/one.webp', '/api/uploads/two.webp'],
    });
  });

  it('rejects unsupported media types before calling the upload API', async () => {
    const appState = createAppState();
    useAppMock.mockReturnValue(appState);

    render(<ManageProductsPanel />);
    await openAddForm();

    const invalidFile = new File(['heic'], 'photo.heic', { type: 'image/heic' });
    fireEvent.change(screen.getByTestId('gallery-upload'), {
      target: { files: [invalidFile] },
    });

    expect(appState.showNotification).toHaveBeenCalledWith(UNSUPPORTED_MEDIA_MESSAGE, 'error');
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(uploadFilesMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('crop-modal')).not.toBeInTheDocument();
  });

  it('replaces the selected image slot and appends additional uploaded URLs in order', async () => {
    const appState = createAppState();
    useAppMock.mockReturnValue(appState);

    render(<ManageProductsPanel />);
    await openAddForm();

    const first = new File(['one'], 'one.jpg', { type: 'image/jpeg' });
    const second = new File(['two'], 'two.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('gallery-upload'), {
      target: { files: [first, second] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('images-state')).toHaveTextContent('/api/uploads/one.webp|/api/uploads/two.webp');
    });
    expect(uploadFilesMock).toHaveBeenCalledWith([first, second]);
  });

  it('keeps uploaded media in the form when product save fails', async () => {
    const appState = createAppState({
      addProduct: vi.fn().mockRejectedValue(new Error('save failed')),
    });
    useAppMock.mockReturnValue(appState);

    render(<ManageProductsPanel />);
    await openAddForm();

    fireEvent.click(screen.getByText('Set Valid Form'));
    const imageFile = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('gallery-upload'), {
      target: { files: [imageFile] },
    });

    await screen.findByTestId('crop-modal');
    fireEvent.click(screen.getByText('Skip Upload'));

    await waitFor(() => {
      expect(screen.getByTestId('images-state')).toHaveTextContent('/api/uploads/uploaded.webp');
    });

    fireEvent.click(screen.getByText('Save Product'));

    await waitFor(() => {
      expect(appState.addProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          images: expect.arrayContaining([
            expect.objectContaining({ url: '/api/uploads/uploaded.webp' }),
          ]),
        })
      );
    });
    expect(appState.addProduct).toHaveBeenCalledWith(
      expect.not.objectContaining({
        images: expect.arrayContaining([expect.objectContaining({ url: '' })]),
      })
    );

    expect(screen.getByTestId('product-form-modal')).toBeInTheDocument();
    expect(screen.getByTestId('images-state')).toHaveTextContent('/api/uploads/uploaded.webp');
  });

  it('waits for a successful save before closing and resetting the form', async () => {
    const deferred = createDeferred();
    const appState = createAppState({
      addProduct: vi.fn().mockReturnValue(deferred.promise),
    });
    useAppMock.mockReturnValue(appState);

    render(<ManageProductsPanel />);
    await openAddForm();

    fireEvent.click(screen.getByText('Set Valid Form'));
    fireEvent.click(screen.getByText('Save Product'));

    expect(appState.addProduct).toHaveBeenCalled();
    expect(screen.getByTestId('product-form-modal')).toBeInTheDocument();

    deferred.resolve({ id: 9 });

    await waitFor(() => {
      expect(screen.queryByTestId('product-form-modal')).not.toBeInTheDocument();
    });
  });

  it('omits the primary image field when saving a product with no gallery images', async () => {
    const appState = createAppState();
    useAppMock.mockReturnValue(appState);

    render(<ManageProductsPanel />);
    await openAddForm();

    fireEvent.click(screen.getByText('Set Valid Form'));
    fireEvent.click(screen.getByText('Save Product'));

    await waitFor(() => {
      expect(appState.addProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [],
        })
      );
    });
  });

  it('omits null primary image when editing a product that only has thumbnail', async () => {
    const appState = createAppState({
      products: [
        {
          id: 128,
          name: 'Habit OG Lemonade',
          categoryId: 1,
          description: '',
          hidden: false,
          vipOnly: false,
          images: [{ id: 1, url: '/api/uploads/existing-thumb.webp', role: 'THUMBNAIL', sortOrder: 0 }],
          variants: [
            { id: 1001, label: 'Default', basePrice: 12.99, stock: 0, stockEnabled: false, isDefault: true, active: true, pricingMode: 'UNIT', quantityOptions: [], priceBreaks: [] },
          ],
        },
      ],
    });
    useAppMock.mockReturnValue(appState);

    render(<ManageProductsPanel />);

    fireEvent.click(screen.getByText('Edit'));
    await screen.findByTestId('product-form-modal');
    fireEvent.click(screen.getByText('Save Product'));

    await waitFor(() => {
      expect(appState.updateProduct).toHaveBeenCalledWith(
        128,
        expect.objectContaining({
          images: expect.arrayContaining([
            expect.objectContaining({ url: '/api/uploads/existing-thumb.webp', role: 'THUMBNAIL' }),
          ]),
        })
      );
    });
  });
});
