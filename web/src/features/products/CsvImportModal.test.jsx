import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CsvImportModal from './CsvImportModal';

vi.mock('./csvHelpers', () => ({
  parseCsvFile: vi.fn(),
  validateAndTransformRows: vi.fn(),
  getCsvTemplate: vi.fn(),
  exportProductsToCsv: vi.fn(),
}));

vi.mock('../../services/productsApi', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
}));

import { parseCsvFile, validateAndTransformRows, getCsvTemplate } from './csvHelpers';
import * as productsApi from '../../services/productsApi';

const CATEGORIES = [{ id: 1, name: 'Drinks' }];

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  categories: CATEGORIES,
};

function makeFile(name = 'products.csv') {
  return new File(['name,categoryName'], name, { type: 'text/csv' });
}

const VALID_ROWS = [
  {
    rowNumber: 1,
    action: 'create',
    payload: { name: 'New', categoryId: 1, price: 5, stock: 0, stockEnabled: false },
  },
];

const INVALID_ROWS = [
  { rowNumber: 2, rawData: { name: '' }, errors: ['Name is required'] },
];

beforeEach(() => {
  vi.clearAllMocks();
  DEFAULT_PROPS.onClose = vi.fn();
  parseCsvFile.mockResolvedValue({ data: [], errors: [] });
  validateAndTransformRows.mockReturnValue({ valid: VALID_ROWS, invalid: [] });
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('CsvImportModal rendering', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<CsvImportModal {...DEFAULT_PROPS} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the upload step by default when open', () => {
    render(<CsvImportModal {...DEFAULT_PROPS} />);
    expect(screen.getByText('Import Products from CSV')).toBeInTheDocument();
    expect(screen.getByText(/choose a csv file/i)).toBeInTheDocument();
  });

  it('renders all 5 step labels', () => {
    render(<CsvImportModal {...DEFAULT_PROPS} />);
    for (const label of ['Upload', 'Preview', 'Confirm', 'Processing', 'Results']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows a Cancel button on the upload step', () => {
    render(<CsvImportModal {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});

// ─── Upload step ──────────────────────────────────────────────────────────────

describe('upload step', () => {
  it('calls onClose when Cancel is clicked', () => {
    render(<CsvImportModal {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('calls onClose when the X button is clicked', () => {
    render(<CsvImportModal {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('calls onClose when the overlay is clicked', () => {
    render(<CsvImportModal {...DEFAULT_PROPS} />);
    fireEvent.click(document.querySelector('.csv-modal-overlay'));
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('calls getCsvTemplate when "Download template" is clicked', () => {
    render(<CsvImportModal {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /download template/i }));
    expect(getCsvTemplate).toHaveBeenCalled();
  });

  it('shows parse errors returned from parseCsvFile', async () => {
    parseCsvFile.mockResolvedValue({ data: [], errors: ['Row 1: unexpected field'] });
    render(<CsvImportModal {...DEFAULT_PROPS} />);

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/row 1: unexpected field/i)).toBeInTheDocument();
    });
  });

  it('shows an error when a non-CSV file is dropped', async () => {
    render(<CsvImportModal {...DEFAULT_PROPS} />);
    const dropzone = document.querySelector('.csv-dropzone');
    const badFile = new File(['data'], 'photo.png', { type: 'image/png' });

    fireEvent.drop(dropzone, { dataTransfer: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByText(/please select a .csv file/i)).toBeInTheDocument();
    });
  });
});

// ─── Preview step ─────────────────────────────────────────────────────────────

async function goToPreview(props = DEFAULT_PROPS) {
  render(<CsvImportModal {...props} />);
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [makeFile()] } });
  await waitFor(() => screen.getByText(/preview import/i));
}

describe('preview step', () => {
  it('shows the preview title with row count', async () => {
    await goToPreview();
    expect(screen.getByText(/preview import \(1 rows?\)/i)).toBeInTheDocument();
  });

  it('shows create count summary card', async () => {
    await goToPreview();
    expect(screen.getByText('to create')).toBeInTheDocument();
  });

  it('shows error rows in the table', async () => {
    validateAndTransformRows.mockReturnValue({ valid: VALID_ROWS, invalid: INVALID_ROWS });
    await goToPreview();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('does not show an update summary card', async () => {
    await goToPreview();
    expect(screen.queryByText('to update')).not.toBeInTheDocument();
  });

  it('disables Continue button when there are no valid rows', async () => {
    validateAndTransformRows.mockReturnValue({ valid: [], invalid: INVALID_ROWS });
    await goToPreview();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('enables Continue button when there is at least one valid row', async () => {
    await goToPreview();
    expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
  });

  it('returns to the upload step when Back is clicked', async () => {
    await goToPreview();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() => {
      expect(screen.getByText('Import Products from CSV')).toBeInTheDocument();
    });
  });
});

// ─── Confirm step ─────────────────────────────────────────────────────────────

async function goToConfirm() {
  await goToPreview();
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  await waitFor(() => screen.getByText(/confirm import/i));
}

describe('confirm step', () => {
  it('shows a summary mentioning create count', async () => {
    await goToConfirm();
    expect(screen.getByText(/create 1 product/i)).toBeInTheDocument();
  });

  it('does not mention "update" in the confirm text', async () => {
    await goToConfirm();
    expect(screen.queryByText(/update \d+ product/i)).not.toBeInTheDocument();
  });

  it('returns to preview when Back is clicked', async () => {
    await goToConfirm();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() => screen.getByText(/preview import/i));
  });
});

// ─── Processing + Results ─────────────────────────────────────────────────────

async function goToResults({ createResult = 'success' } = {}) {
  productsApi.createProduct.mockImplementation(() =>
    createResult === 'success'
      ? Promise.resolve({ id: 99, name: 'New' })
      : Promise.reject(new Error('Server error'))
  );

  await goToConfirm();
  fireEvent.click(screen.getByRole('button', { name: /start import/i }));
  await waitFor(() => screen.getByRole('heading', { name: /import complete/i }), { timeout: 3000 });
}

describe('processing & results', () => {
  it('calls createProduct for each valid row', async () => {
    await goToResults();
    expect(productsApi.createProduct).toHaveBeenCalledWith(VALID_ROWS[0].payload);
  });

  it('never calls updateProduct', async () => {
    await goToResults();
    expect(productsApi.updateProduct).not.toHaveBeenCalled();
  });

  it('shows success message when all rows succeed', async () => {
    await goToResults();
    expect(screen.getByText(/import completed successfully/i)).toBeInTheDocument();
  });

  it('lists failed rows when API calls throw', async () => {
    await goToResults({ createResult: 'fail' });
    expect(screen.getByText(/server error/i)).toBeInTheDocument();
  });

  it('calls onClose when Close button is clicked on the results step', async () => {
    await goToResults();
    fireEvent.click(screen.getByText('Close'));
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
  });

  it('does not show X or allow overlay click during processing', async () => {
    productsApi.createProduct.mockImplementation(() => new Promise(() => {}));
    await goToConfirm();
    fireEvent.click(screen.getByRole('button', { name: /start import/i }));

    await waitFor(() => screen.getByText(/importing/i));
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

    fireEvent.click(document.querySelector('.csv-modal-overlay'));
    expect(DEFAULT_PROPS.onClose).not.toHaveBeenCalled();
  });
});
