import React, { useState, useRef } from 'react';
import { Upload, FileDown, CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react';
import * as productsApi from '../../services/productsApi';
import { parseCsvFile, validateAndTransformRows, getCsvTemplate } from './csvHelpers';

const STEPS = ['upload', 'preview', 'confirm', 'processing', 'results'];

function StepIndicator({ step }) {
  const labels = ['Upload', 'Preview', 'Confirm', 'Processing', 'Results'];
  const current = STEPS.indexOf(step);
  return (
    <div className="csv-modal-steps">
      {labels.map((label, i) => (
        <div
          key={label}
          className={`csv-modal-step ${i < current ? 'csv-modal-step-done' : i === current ? 'csv-modal-step-active' : ''}`}
        >
          <div className="csv-modal-step-circle">
            {i < current ? <CheckCircle size={14} /> : i + 1}
          </div>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function SummaryCards({ createCount, errorCount }) {
  return (
    <div className="csv-summary-cards">
      <div className="csv-summary-card csv-summary-card-create">
        <div className="csv-summary-card-number">{createCount}</div>
        <div className="csv-summary-card-label">to create</div>
      </div>
      {errorCount > 0 && (
        <div className="csv-summary-card csv-summary-card-error">
          <div className="csv-summary-card-number">{errorCount}</div>
          <div className="csv-summary-card-label">with errors</div>
        </div>
      )}
    </div>
  );
}

export default function CsvImportModal({ isOpen, onClose, categories }) {
  const [step, setStep] = useState('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);
  const [validRows, setValidRows] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [rowErrors, setRowErrors] = useState([]);
  const [importSummary, setImportSummary] = useState({ created: 0, failed: 0 });
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setStep('upload');
    setIsDragging(false);
    setParseErrors([]);
    setValidRows([]);
    setInvalidRows([]);
    setProcessedCount(0);
    setRowErrors([]);
    setImportSummary({ created: 0, failed: 0 });
    onClose();
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setParseErrors(['Please select a .csv file.']);
      return;
    }
    setParseErrors([]);
    const { data, errors } = await parseCsvFile(file);
    if (errors.length > 0) {
      setParseErrors(errors);
      return;
    }
    const { valid, invalid } = validateAndTransformRows(data, categories);
    setValidRows(valid);
    setInvalidRows(invalid);
    setStep('preview');
  };

  const handleFileInput = (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const runImport = async () => {
    setStep('processing');
    setProcessedCount(0);
    let created = 0, failed = 0;
    const errors = [];

    for (const row of validRows) {
      try {
        await productsApi.createProduct(row.payload);
        created++;
      } catch (err) {
        failed++;
        errors.push({ rowNumber: row.rowNumber, message: err.message || 'Unknown error' });
      }
      setProcessedCount(prev => prev + 1);
    }

    setImportSummary({ created, failed });
    setRowErrors(errors);
    setStep('results');
  };

  const canDismiss = step !== 'processing';

  // --- Render step content ---

  const renderUpload = () => (
    <div className="csv-modal-body">
      <p className="csv-modal-description">
        Upload a CSV file to bulk-create products. Required columns: <code>name</code>, <code>categoryName</code>, <code>price</code>.
        Optional: <code>description</code>, <code>stock</code>, <code>stockEnabled</code>.
        Images must be managed through the product edit form after import.
      </p>
      <div className="csv-modal-template-row">
        <button type="button" className="btn-secondary" onClick={() => getCsvTemplate()}>
          <FileDown size={16} /> Download template
        </button>
      </div>
      {parseErrors.length > 0 && (
        <div className="csv-parse-errors">
          {parseErrors.map((e, i) => (
            <div key={i} className="csv-parse-error"><AlertCircle size={14} /> {e}</div>
          ))}
        </div>
      )}
      <div
        className={`csv-dropzone ${isDragging ? 'csv-dropzone-active' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <Upload size={32} className="csv-dropzone-icon" />
        <p className="csv-dropzone-label">Choose a CSV file or drag and drop</p>
        <p className="csv-dropzone-hint">.csv files only</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>
    </div>
  );

  const renderPreview = () => (
    <div className="csv-modal-body">
      <SummaryCards createCount={validRows.length} errorCount={invalidRows.length} />
      {invalidRows.length > 0 && (
        <p className="csv-modal-note">
          <AlertTriangle size={14} /> Rows with errors will be skipped. Fix them in your CSV and re-upload if needed.
        </p>
      )}
      <div className="csv-preview-table-wrapper">
        <table className="csv-preview-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {validRows.map(row => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>{row.payload.name}</td>
                <td>{row.payload.categoryId}</td>
                <td>${row.payload.price}</td>
                <td />
              </tr>
            ))}
            {invalidRows.map(row => (
              <tr key={`invalid-${row.rowNumber}`} className="csv-row-error">
                <td>{row.rowNumber}</td>
                <td>{row.rawData.name || '—'}</td>
                <td>{row.rawData.categoryName || '—'}</td>
                <td>{row.rawData.price || '—'}</td>
                <td className="csv-issues-cell">
                  {row.errors.map((e, i) => <div key={i} className="csv-error-text"><AlertCircle size={12} /> {e}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderConfirm = () => (
    <div className="csv-modal-body">
      <p className="csv-modal-confirm-text">
        You are about to <strong>create {validRows.length} product{validRows.length !== 1 ? 's' : ''}</strong>.
        {invalidRows.length > 0 && (
          <> <span className="csv-skip-note">{invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors will be skipped.</span></>
        )}
      </p>
    </div>
  );

  const renderProcessing = () => (
    <div className="csv-modal-body csv-modal-body-centered">
      <p className="csv-modal-processing-label">Processing row {processedCount} of {validRows.length}…</p>
      <div className="csv-progress-bar-track">
        <div
          className="csv-progress-bar-fill"
          style={{ width: `${validRows.length > 0 ? (processedCount / validRows.length) * 100 : 0}%` }}
        />
      </div>
    </div>
  );

  const renderResults = () => (
    <div className="csv-modal-body">
      <SummaryCards createCount={importSummary.created} errorCount={importSummary.failed} />
      {rowErrors.length > 0 && (
        <div className="csv-row-errors-list">
          <p className="csv-modal-note"><AlertCircle size={14} /> The following rows failed during import:</p>
          {rowErrors.map((e, i) => (
            <div key={i} className="csv-row-error-item">
              <strong>Row {e.rowNumber}:</strong> {e.message}
            </div>
          ))}
        </div>
      )}
      {rowErrors.length === 0 && (
        <p className="csv-modal-success"><CheckCircle size={16} /> Import completed successfully.</p>
      )}
    </div>
  );

  const renderFooter = () => {
    if (step === 'upload') {
      return (
        <div className="csv-modal-footer">
          <button type="button" className="btn-secondary" onClick={resetAndClose}>Cancel</button>
        </div>
      );
    }
    if (step === 'preview') {
      return (
        <div className="csv-modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setStep('upload')}>Back</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setStep('confirm')}
            disabled={validRows.length === 0}
          >
            Continue
          </button>
        </div>
      );
    }
    if (step === 'confirm') {
      return (
        <div className="csv-modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setStep('preview')}>Back</button>
          <button type="button" className="btn-primary" onClick={runImport}>
            Start Import
          </button>
        </div>
      );
    }
    if (step === 'processing') {
      return null;
    }
    if (step === 'results') {
      return (
        <div className="csv-modal-footer">
          <button type="button" className="btn-primary" onClick={resetAndClose}>Close</button>
        </div>
      );
    }
  };

  const titles = {
    upload: 'Import Products from CSV',
    preview: `Preview Import (${validRows.length + invalidRows.length} rows)`,
    confirm: 'Confirm Import',
    processing: 'Importing…',
    results: 'Import Complete',
  };

  return (
    <div
      className="csv-modal-overlay"
      onClick={canDismiss ? resetAndClose : undefined}
    >
      <div className="csv-modal-content" onClick={e => e.stopPropagation()}>
        <div className="csv-modal-header">
          <h2 className="csv-modal-title">{titles[step]}</h2>
          {canDismiss && (
            <button type="button" className="csv-modal-close" onClick={resetAndClose} aria-label="Close">
              <X size={20} />
            </button>
          )}
        </div>

        <StepIndicator step={step} />

        {step === 'upload' && renderUpload()}
        {step === 'preview' && renderPreview()}
        {step === 'confirm' && renderConfirm()}
        {step === 'processing' && renderProcessing()}
        {step === 'results' && renderResults()}

        {renderFooter()}
      </div>
    </div>
  );
}
