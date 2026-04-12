import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normaliseBooleanCell, validateAndTransformRows, exportProductsToCsv, getCsvTemplate } from './csvHelpers';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 1, name: 'Drinks' },
  { id: 2, name: 'Snacks' },
];

const EXISTING_PRODUCTS = [
  { id: 10, name: 'Cola' },
  { id: 20, name: 'Chips' },
];

const VALID_ROW = {
  id: '',
  name: 'New Product',
  categoryName: 'Drinks',
  price: '9.99',
  description: 'A tasty thing',
  stock: '50',
  stockEnabled: 'true',
};

// ─── normaliseBooleanCell ─────────────────────────────────────────────────────

describe('normaliseBooleanCell', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['True', true],
    ['1', true],
    ['yes', true],
    ['YES', true],
    ['Yes', true],
  ])('maps %s → true', (input, expected) => {
    expect(normaliseBooleanCell(input)).toBe(expected);
  });

  it.each([
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['no', false],
    ['NO', false],
    ['random', false],
  ])('maps %s → false', (input, expected) => {
    expect(normaliseBooleanCell(input)).toBe(expected);
  });

  it('returns false default when value is empty string', () => {
    expect(normaliseBooleanCell('')).toBe(false);
  });

  it('returns false default when value is undefined', () => {
    expect(normaliseBooleanCell(undefined)).toBe(false);
  });

  it('returns false default when value is null', () => {
    expect(normaliseBooleanCell(null)).toBe(false);
  });

  it('respects a custom default of true for blank values', () => {
    expect(normaliseBooleanCell('', true)).toBe(true);
    expect(normaliseBooleanCell(undefined, true)).toBe(true);
  });
});

// ─── validateAndTransformRows ─────────────────────────────────────────────────

describe('validateAndTransformRows', () => {
  describe('create (no id)', () => {
    it('produces a create row with correct payload', () => {
      const { valid, invalid } = validateAndTransformRows([VALID_ROW], EXISTING_PRODUCTS, CATEGORIES);
      expect(invalid).toHaveLength(0);
      expect(valid).toHaveLength(1);
      const row = valid[0];
      expect(row.action).toBe('create');
      expect(row.id).toBeUndefined();
      expect(row.rowNumber).toBe(1);
      expect(row.payload).toMatchObject({
        name: 'New Product',
        categoryId: 1,
        price: 9.99,
        description: 'A tasty thing',
        stock: 50,
        stockEnabled: true,
      });
    });

    it('resolves categoryId from categoryName (case-insensitive)', () => {
      const row = { ...VALID_ROW, categoryName: 'drinks' };
      const { valid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid[0].payload.categoryId).toBe(1);
    });

    it('resolves categoryId case-insensitively for mixed case', () => {
      const row = { ...VALID_ROW, categoryName: 'SNACKS' };
      const { valid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid[0].payload.categoryId).toBe(2);
    });

    it('sets description to undefined when blank', () => {
      const row = { ...VALID_ROW, description: '' };
      const { valid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid[0].payload.description).toBeUndefined();
    });

    it('defaults stock to 0 when omitted', () => {
      const row = { ...VALID_ROW, stock: '' };
      const { valid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid[0].payload.stock).toBe(0);
    });

    it('defaults stockEnabled to false when omitted', () => {
      const row = { ...VALID_ROW, stockEnabled: '' };
      const { valid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid[0].payload.stockEnabled).toBe(false);
    });
  });

  describe('update (id matches existing product)', () => {
    it('produces an update row when id matches an existing product', () => {
      const row = { ...VALID_ROW, id: '10' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(invalid).toHaveLength(0);
      expect(valid[0].action).toBe('update');
      expect(valid[0].id).toBe(10);
    });
  });

  describe('warnings', () => {
    it('warns and falls back to create when id does not match any existing product', () => {
      const row = { ...VALID_ROW, id: '999' };
      const { valid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid[0].action).toBe('create');
      expect(valid[0].id).toBeUndefined();
      expect(valid[0].warnings.some(w => w.includes('999'))).toBe(true);
    });

    it('warns on duplicate ids within the same CSV', () => {
      const row1 = { ...VALID_ROW, id: '10' };
      const row2 = { ...VALID_ROW, id: '10' };
      const { valid } = validateAndTransformRows([row1, row2], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid[0].action).toBe('update');
      expect(valid[1].action).toBe('create');
      expect(valid[1].warnings.some(w => w.toLowerCase().includes('duplicate'))).toBe(true);
    });
  });

  describe('invalid rows', () => {
    it('rejects a row with an invalid id (non-integer)', () => {
      const row = { ...VALID_ROW, id: 'abc' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid).toHaveLength(0);
      expect(invalid[0].errors.some(e => e.toLowerCase().includes('id'))).toBe(true);
    });

    it('rejects a row with no name', () => {
      const row = { ...VALID_ROW, name: '' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid).toHaveLength(0);
      expect(invalid[0].errors).toContain('Name is required');
    });

    it('rejects a row with no categoryName', () => {
      const row = { ...VALID_ROW, categoryName: '' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid).toHaveLength(0);
      expect(invalid[0].errors.some(e => e.toLowerCase().includes('categoryname'))).toBe(true);
    });

    it('rejects a row with an unrecognised categoryName', () => {
      const row = { ...VALID_ROW, categoryName: 'Electronics' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid).toHaveLength(0);
      expect(invalid[0].errors.some(e => e.includes('Electronics'))).toBe(true);
    });

    it('rejects a row with an empty price', () => {
      const row = { ...VALID_ROW, price: '' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid).toHaveLength(0);
      expect(invalid[0].errors).toContain('Price is required');
    });

    it('rejects a row with a price that has a currency prefix', () => {
      const row = { ...VALID_ROW, price: '$9.99' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid).toHaveLength(0);
      expect(invalid[0].errors.some(e => e.toLowerCase().includes('price'))).toBe(true);
    });

    it('rejects a row with a negative price', () => {
      const row = { ...VALID_ROW, price: '-1' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid).toHaveLength(0);
      expect(invalid[0].errors.some(e => e.toLowerCase().includes('price'))).toBe(true);
    });

    it('rejects a row with a negative stock', () => {
      const row = { ...VALID_ROW, stock: '-5' };
      const { valid, invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(valid).toHaveLength(0);
      expect(invalid[0].errors.some(e => e.toLowerCase().includes('stock'))).toBe(true);
    });

    it('collects multiple errors on the same row', () => {
      const row = { ...VALID_ROW, name: '', price: 'bad', categoryName: '' };
      const { invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(invalid[0].errors.length).toBeGreaterThanOrEqual(3);
    });

    it('attaches the raw row data to invalid rows', () => {
      const row = { ...VALID_ROW, name: '' };
      const { invalid } = validateAndTransformRows([row], EXISTING_PRODUCTS, CATEGORIES);
      expect(invalid[0].rawData).toEqual(row);
    });
  });

  describe('row numbering', () => {
    it('assigns 1-based row numbers matching the original order', () => {
      const rows = [VALID_ROW, { ...VALID_ROW, name: '' }, VALID_ROW];
      const { valid, invalid } = validateAndTransformRows(rows, EXISTING_PRODUCTS, CATEGORIES);
      expect(valid[0].rowNumber).toBe(1);
      expect(invalid[0].rowNumber).toBe(2);
      expect(valid[1].rowNumber).toBe(3);
    });
  });
});

// ─── exportProductsToCsv ──────────────────────────────────────────────────────

describe('exportProductsToCsv', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('triggers a download', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({ href: '', download: '', click: clickSpy });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    exportProductsToCsv([], CATEGORIES);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('includes the current date in the filename', () => {
    let capturedAnchor;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        capturedAnchor = { href: '', download: '', click: vi.fn() };
        return capturedAnchor;
      }
      return document.createElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    exportProductsToCsv([], CATEGORIES);

    const today = new Date().toISOString().slice(0, 10);
    expect(capturedAnchor.download).toBe(`products-export-${today}.csv`);
  });
});

// ─── getCsvTemplate ───────────────────────────────────────────────────────────

describe('getCsvTemplate', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('downloads a file named products-template.csv', () => {
    let capturedAnchor;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        capturedAnchor = { href: '', download: '', click: vi.fn() };
        return capturedAnchor;
      }
      return document.createElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    getCsvTemplate();

    expect(capturedAnchor.download).toBe('products-template.csv');
  });

  it('template file contains the header row and 2 sample data rows', () => {
    let capturedContent = '';
    vi.spyOn(globalThis, 'Blob').mockImplementation(function (parts) {
      capturedContent = parts[0];
      return { size: capturedContent.length, type: '' };
    });
    vi.spyOn(document, 'createElement').mockReturnValue({ href: '', download: '', click: vi.fn() });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    getCsvTemplate();

    const lines = capturedContent.trim().split('\n').map(l => l.replace(/\r$/, ''));
    // Header + 2 sample rows
    expect(lines).toHaveLength(3);
    // Header includes id as the first column
    const headers = lines[0].split(',');
    expect(headers).toEqual(['id', 'name', 'categoryName', 'price', 'description', 'stock', 'stockEnabled']);
    // First sample row has blank id (create), second has a numeric id (update example)
    expect(lines[1]).toContain('New Product');
    expect(lines[1]).toMatch(/^,/); // blank id field
    expect(lines[2]).toContain('Existing Product');
    expect(lines[2]).toMatch(/^123,/); // populated id field
  });
});
