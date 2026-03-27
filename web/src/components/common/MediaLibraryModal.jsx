import React, { useState, useEffect } from 'react';
import { X, Trash2, Loader2, UploadCloud, RefreshCw, PlayCircle, Grid, List as ListIcon, CheckCircle2 } from 'lucide-react';
import { getImages, deleteImage, uploadFile } from '../../services/uploadApi';
import ImageCropModal from './ImageCropModal';
import './MediaLibraryModal.css';

// Helper to check if a url is a video
const isVideo = (url) => {
  if (!url) return false;
  return url.match(/\.(mp4|webm)$/i);
};

function MediaLibraryModal({ isOpen, onClose, onSelect, multiSelect = false, hideInsertButton = false }) {
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [selectedItems, setSelectedItems] = useState([]);
  const [cropFile, setCropFile] = useState(null);
  const [dimensions, setDimensions] = useState({});

  useEffect(() => {
    if (isOpen) {
      fetchImages();
      setSelectedItems([]); // Reset selection when opened
    }
  }, [isOpen]);

  const fetchImages = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getImages();
      const fetched = data.images || [];
      setImages(fetched);
      loadDimensions(fetched);
    } catch (err) {
      setError(err.message || 'Failed to load images');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDimensions = (items) => {
    items.forEach((item) => {
      if (isVideo(item.url)) return;
      const img = new Image();
      img.onload = () => {
        setDimensions((prev) => ({
          ...prev,
          [item.url]: { width: img.naturalWidth, height: img.naturalHeight },
        }));
      };
      img.src = item.url;
    });
  };

  const handleDelete = async (filename, e) => {
    e.stopPropagation(); // Prevent selection
    if (!window.confirm(`Are you sure you want to delete ${filename}? This might break products using this image.`)) {
      return;
    }

    try {
      await deleteImage(filename);
      // Remove from state without refetching
      setImages((prev) => prev.filter((img) => img.filename !== filename));
      setSelectedItems((prev) => prev.filter((url) => !url.includes(filename)));
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.length} items? This might break products using these images.`)) {
      return;
    }

    setIsLoading(true);
    try {
      // Delete sequentially to avoid overwhelming the server, could also Promise.all
      for (const url of selectedItems) {
        // Extract filename from URL (/api/uploads/filename.ext)
        const filename = url.split('/').pop();
        if (filename) {
          await deleteImage(filename);
        }
      }
      
      // Update state
      setImages((prev) => prev.filter((img) => !selectedItems.includes(img.url)));
      setSelectedItems([]);
    } catch (err) {
      alert(`Bulk delete partially failed: ${err.message}`);
      fetchImages(); // Refetch to get truth
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = null;

    if (file.type.startsWith('video/')) {
      performUpload(file);
    } else {
      setCropFile(file);
    }
  };

  const performUpload = async (file) => {
    setIsUploading(true);
    try {
      await uploadFile(file);
      await fetchImages();
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCropConfirm = (croppedFile) => {
    setCropFile(null);
    performUpload(croppedFile);
  };

  const handleCropSkip = (originalFile) => {
    setCropFile(null);
    performUpload(originalFile);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleItemClick = (url) => {
    if (multiSelect) {
      setSelectedItems(prev => 
        prev.includes(url) 
          ? prev.filter(item => item !== url)
          : [...prev, url]
      );
    } else {
      onSelect(url);
    }
  };

  const handleConfirmSelection = () => {
    onSelect(multiSelect ? selectedItems : selectedItems[0]);
  };

  if (!isOpen) return null;

  return (
    <>
    {cropFile && (
      <ImageCropModal
        file={cropFile}
        onConfirm={handleCropConfirm}
        onSkip={handleCropSkip}
        onCancel={() => setCropFile(null)}
      />
    )}
    <div className="media-modal-overlay" onClick={onClose}>
      <div className="media-modal-content surface-card-accent" onClick={(e) => e.stopPropagation()}>
        <div className="media-modal-header">
          <h3 className="media-modal-title">Media Library</h3>
          
          <div className="media-modal-actions">
            <div className="view-mode-toggle">
              <button 
                className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`} 
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <Grid size={18} />
              </button>
              <button 
                className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`} 
                onClick={() => setViewMode('list')}
                title="List View"
              >
                <ListIcon size={18} />
              </button>
            </div>

            <div className="media-header-divider"></div>

            <label className={`btn-upload-prominent ${isUploading ? 'loading' : ''}`}>
              {isUploading ? <Loader2 size={18} className="spin" /> : <UploadCloud size={18} />}
              <span>{isUploading ? 'Uploading...' : 'Upload New'}</span>
              <input type="file" accept="image/*,video/mp4,video/webm" onChange={handleUpload} disabled={isUploading} hidden />
            </label>
            
            <button className="btn btn-secondary btn-icon" onClick={fetchImages} title="Refresh Library">
              <RefreshCw size={18} />
            </button>
            <button className="btn btn-ghost btn-icon btn-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="media-modal-body">
          {error && <div className="media-error-banner">{error}</div>}
          
          {isLoading ? (
            <div className="media-loading-state">
              <Loader2 size={32} className="spin text-primary" />
              <p>Loading media...</p>
            </div>
          ) : images.length === 0 ? (
            <div className="media-empty-state">
              <div className="media-empty-icon"><UploadCloud size={48} /></div>
              <h4>No images found</h4>
              <p>Upload your first image to start building the library.</p>
            </div>
          ) : (
            <div className={`media-${viewMode}`}>
              {images.map((image) => {
                const isSelected = selectedItems.includes(image.url);
                return (
                  <div 
                    key={image.filename} 
                    className={`media-item ${isSelected ? 'selected' : ''}`} 
                    onClick={() => handleItemClick(image.url)}
                  >
                    <div className="media-item-preview">
                      {isSelected && (
                        <div className="media-select-check">
                          <CheckCircle2 size={24} className="check-icon" />
                        </div>
                      )}
                      
                      {isVideo(image.url) ? (
                        <>
                          <video src={image.url} className="media-thumbnail-video" />
                          <div className="video-thumbnail-overlay">
                            <PlayCircle size={24} color="white" />
                          </div>
                        </>
                      ) : (
                        <img src={image.url} alt={image.filename} loading="lazy" />
                      )}
                    </div>
                    
                    <div className="media-item-info">
                      <div className="media-item-name" title={image.filename}>{image.filename}</div>
                      <div className="media-item-meta">
                        <span className="media-item-size">{formatSize(image.size)}</span>
                        {dimensions[image.url] && (
                          <span className="media-item-size">{dimensions[image.url].width}×{dimensions[image.url].height}</span>
                        )}
                        <span className="media-item-date">{new Date(image.createdAt).toLocaleDateString()}</span>
                        <button 
                          className="btn btn-ghost btn-icon btn-sm btn-delete-media" 
                          onClick={(e) => handleDelete(image.filename, e)}
                          title="Delete Media"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {multiSelect && selectedItems.length > 0 && (
          <div className="media-modal-footer">
            <span className="media-selected-count">{selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected</span>
            <div className="media-footer-actions">
              <button 
                className="btn btn-ghost" 
                style={{ color: 'var(--danger-color)' }}
                onClick={handleBulkDelete}
              >
                <Trash2 size={16} style={{ marginRight: '0.25rem' }} />
                Delete Selected
              </button>
              <button className="btn btn-secondary" onClick={() => setSelectedItems([])}>Cancel</button>
              {!hideInsertButton && (
                <button className="btn-add-product" onClick={handleConfirmSelection}>
                  Insert Selected
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

export default MediaLibraryModal;
