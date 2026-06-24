import React from 'react';
import MediaLibraryModal from '../../../components/common/MediaLibraryModal';
import './ManageStoreMediaPage.css';

function ManageStoreMediaPage() {
  return (
    <div className="manage-store-section">
      <div className="manage-store-section-header">
        <h1 className="manage-store-section-title">Media Library</h1>
        <p className="manage-store-section-subtitle">Upload and manage images and videos</p>
      </div>
      <div className="manage-store-media-inline">
        <MediaLibraryModal isOpen={true} onClose={() => {}} onSelect={() => {}} hideInsertButton={true} hideCloseButton={true} />
      </div>
    </div>
  );
}

export default ManageStoreMediaPage;
