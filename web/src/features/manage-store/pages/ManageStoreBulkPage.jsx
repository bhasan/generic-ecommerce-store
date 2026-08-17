import React, { useRef, useState } from 'react';
import { FileDown, FileUp, FileText, ImageDown, ImageUp } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import CsvImportModal from '../../products/CsvImportModal';
import { getCsvTemplate, exportProductsToCsv } from '../../products/csvHelpers';
import { downloadProductsZip } from '../../../services/productsApi';
import { importImagesZip } from '../../../services/uploadApi';
import './ManageStoreBulkPage.css';

const bulkActions = [
  {
    key: 'import-csv',
    icon: FileUp,
    title: 'Import CSV',
    description: 'Import products from a CSV file. New products will be created and existing ones updated.',
    actionLabel: 'Import CSV',
  },
  {
    key: 'csv-template',
    icon: FileText,
    title: 'CSV Template',
    description: 'Download a blank CSV template with the correct column headers for importing products.',
    actionLabel: 'Download Template',
  },
  {
    key: 'export-csv',
    icon: FileDown,
    title: 'Export CSV',
    description: 'Export all products to a CSV file including prices, categories, and stock levels.',
    actionLabel: 'Export CSV',
  },
  {
    key: 'export-zip',
    icon: ImageDown,
    title: 'Export Images ZIP',
    description: 'Download all product images as a ZIP archive.',
    actionLabel: 'Export ZIP',
  },
  {
    key: 'import-zip',
    icon: ImageUp,
    title: 'Import Images ZIP',
    description: 'Upload a ZIP file containing product images to import them into the media library.',
    actionLabel: 'Import ZIP',
  },
];

function ManageStoreBulkPage() {
  const { products, categories, loadProducts } = useApp();
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [isLoadingZip, setIsLoadingZip] = useState(false);
  const [isImportingZip, setIsImportingZip] = useState(false);
  const zipInputRef = useRef(null);

  const handleAction = async (key) => {
    switch (key) {
      case 'import-csv':
        setShowCsvImport(true);
        break;
      case 'csv-template':
        getCsvTemplate();
        break;
      case 'export-csv':
        exportProductsToCsv(products, categories);
        break;
      case 'export-zip':
        setIsLoadingZip(true);
        try { await downloadProductsZip(); }
        finally { setIsLoadingZip(false); }
        break;
      case 'import-zip':
        zipInputRef.current?.click();
        break;
      default:
        break;
    }
  };

  const handleZipFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsImportingZip(true);
    try { await importImagesZip(file); }
    finally { setIsImportingZip(false); }
  };

  const isDisabled = (key) => {
    if (key === 'export-zip') return isLoadingZip;
    if (key === 'import-zip') return isImportingZip;
    return false;
  };

  const getLabel = (action) => {
    if (action.key === 'export-zip' && isLoadingZip) return 'Downloading...';
    if (action.key === 'import-zip' && isImportingZip) return 'Importing...';
    return action.actionLabel;
  };

  return (
    <div className="manage-store-section">
      <div className="manage-store-section-header">
        <h1 className="manage-store-section-title">Bulk Management</h1>
        <p className="manage-store-section-subtitle">Import and export products and media in bulk</p>
      </div>

      <div className="bulk-actions-grid">
        {bulkActions.map((action) => {
          const Icon = action.icon;
          return (
            <div key={action.key} className="bulk-action-card surface-card">
              <div className="bulk-action-icon">
                <Icon size={28} />
              </div>
              <div className="bulk-action-body">
                <h3 className="bulk-action-title">{action.title}</h3>
                <p className="bulk-action-desc">{action.description}</p>
              </div>
              <button
                className="bulk-action-btn"
                onClick={() => handleAction(action.key)}
                disabled={isDisabled(action.key)}
              >
                {getLabel(action)}
              </button>
            </div>
          );
        })}
      </div>

      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        hidden
        onChange={handleZipFileChange}
      />

      <CsvImportModal
        isOpen={showCsvImport}
        onClose={() => { setShowCsvImport(false); loadProducts(); }}
        products={products}
        categories={categories}
      />
    </div>
  );
}

export default ManageStoreBulkPage;
