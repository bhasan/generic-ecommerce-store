import Papa from 'papaparse';

// Columns written to the full product export (matches backend productExport.service.ts)
const EXPORT_FIELDS = ['id', 'name', 'slug', 'categoryName', 'price', 'description', 'stock', 'stockEnabled', 'thumbnail', 'images'];

// Columns used for the import template (image import is not supported)
const TEMPLATE_FIELDS = ['id', 'name', 'categoryName', 'price', 'description', 'stock', 'stockEnabled'];

/**
 * Trigger a browser file download.
 */
function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all products to a CSV file and trigger a browser download.
 */
export function exportProductsToCsv(products, categories) {
  const categoryMap = {};
  for (const cat of categories) {
    categoryMap[cat.id] = cat.name;
  }

  const urlToFilename = (url) => url?.split('/').pop() ?? '';

  const rows = products.map(p => {
    const thumbImg = (p.images ?? []).find(img => img.role === 'THUMBNAIL');
    const galleryImgs = (p.images ?? []).filter(img => img.role !== 'THUMBNAIL');
    const defaultVariant = (p.variants ?? []).find(v => v.isDefault && v.active) ?? (p.variants ?? [])[0];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug ?? '',
      categoryName: categoryMap[p.categoryId ?? p.category?.id] ?? '',
      price: Number(defaultVariant?.basePrice ?? 0),
      description: p.description ?? '',
      stock: Number(defaultVariant?.stock ?? 0),
      stockEnabled: defaultVariant?.stockEnabled ?? false,
      thumbnail: urlToFilename(thumbImg?.url),
      images: galleryImgs.map(img => urlToFilename(img.url)).filter(Boolean).join(';'),
    };
  });

  const csv = Papa.unparse(rows, { columns: EXPORT_FIELDS });
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(csv, `products-export-${date}.csv`);
}

/**
 * Download a CSV template with sample rows.
 */
export function getCsvTemplate() {
  const sampleRows = [
    {
      id: '',
      name: 'New Product (leave id blank to create)',
      categoryName: 'Your Category Name',
      price: '9.99',
      description: 'Optional product description',
      stock: '100',
      stockEnabled: 'true',
    },
    {
      id: '123',
      name: 'Existing Product (fill in id to update)',
      categoryName: 'Your Category Name',
      price: '4.99',
      description: '',
      stock: '0',
      stockEnabled: 'false',
    },
  ];
  const csv = Papa.unparse({ fields: TEMPLATE_FIELDS, data: sampleRows });
  downloadCsv(csv, 'products-template.csv');
}

/**
 * Parse a CSV File object using PapaParse.
 * @returns {Promise<{ data: object[], errors: string[] }>}
 */
export function parseCsvFile(file) {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors = results.errors.map(e => `Row ${e.row ?? '?'}: ${e.message}`);
        resolve({ data: results.data, errors });
      },
      error: (err) => {
        resolve({ data: [], errors: [err.message] });
      },
    });
  });
}

/**
 * Normalise a CSV cell value to a boolean.
 */
export function normaliseBooleanCell(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['true', '1', 'yes'].includes(String(value).toLowerCase().trim());
}

/**
 * Validate and transform parsed CSV rows into ready-to-submit payloads.
 * - Rows with an id matching an existing product → action: 'update'
 * - Rows with no id (or blank id) → action: 'create'
 * - categoryName is matched case-insensitively against loaded categories.
 *
 * @param {object[]} rows - Raw rows from PapaParse
 * @param {object[]} existingProducts - Current products from app context
 * @param {object[]} categories - Current categories from app context
 * @returns {{ valid: TransformedRow[], invalid: InvalidRow[] }}
 */
export function validateAndTransformRows(rows, existingProducts, categories) {
  const categoryByName = {};
  for (const cat of categories) {
    categoryByName[cat.name.toLowerCase()] = cat;
  }

  const existingProductIds = new Set(existingProducts.map(p => p.id));
  const seenIds = new Set();

  const valid = [];
  const invalid = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const errors = [];
    const warnings = [];

    // id (optional) — determines create vs update
    let action = 'create';
    let resolvedId;
    const rawId = String(row.id ?? '').trim();
    if (rawId !== '') {
      const parsedId = parseInt(rawId, 10);
      if (isNaN(parsedId) || parsedId < 1) {
        errors.push('id must be a positive integer when provided');
      } else if (seenIds.has(parsedId)) {
        warnings.push(`Duplicate id ${parsedId} in CSV — treating as create`);
      } else if (!existingProductIds.has(parsedId)) {
        warnings.push(`id ${parsedId} does not match any existing product — treating as create`);
      } else {
        action = 'update';
        resolvedId = parsedId;
        seenIds.add(parsedId);
      }
    }

    // name
    const name = String(row.name ?? '').trim();
    if (!name) errors.push('Name is required');

    // categoryName → categoryId
    const rawCategoryName = String(row.categoryName ?? '').trim();
    const matchedCategory = categoryByName[rawCategoryName.toLowerCase()];
    if (!rawCategoryName) {
      errors.push('categoryName is required');
    } else if (!matchedCategory) {
      errors.push(`Category "${rawCategoryName}" does not match any existing category`);
    }

    // price
    const rawPrice = String(row.price ?? '').trim();
    const price = parseFloat(rawPrice);
    if (!rawPrice) {
      errors.push('Price is required');
    } else if (isNaN(price) || price < 0) {
      errors.push('Price must be a non-negative number (e.g. 9.99)');
    }

    // stock
    const stockRaw = row.stock;
    let stock = 0;
    if (stockRaw !== undefined && stockRaw !== '') {
      stock = parseFloat(stockRaw);
      if (isNaN(stock) || stock < 0) {
        errors.push('stock must be a non-negative number');
        stock = 0;
      }
    }

    const stockEnabled = normaliseBooleanCell(row.stockEnabled, false);

    if (errors.length > 0) {
      invalid.push({ rowNumber, rawData: row, errors });
    } else {
      valid.push({
        rowNumber,
        action,
        id: resolvedId,
        payload: {
          name,
          categoryId: matchedCategory.id,
          description: String(row.description ?? '').trim() || undefined,
          variants: [{
            label: 'Default',
            sku: `CSV-${name.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}-${Date.now()}`,
            pricingMode: 'UNIT',
            basePrice: price,
            stock,
            stockEnabled,
            isDefault: true,
            active: true,
            quantityOptions: [],
            priceBreaks: [],
          }],
        },
        warnings,
      });
    }
  });

  return { valid, invalid };
}
