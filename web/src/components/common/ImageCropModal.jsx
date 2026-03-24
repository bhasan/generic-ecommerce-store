import React, { useState, useRef } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, CropIcon, Upload } from 'lucide-react';
import './ImageCropModal.css';

function centerFreeformCrop(mediaWidth, mediaHeight) {
  // Default to a reasonable centered selection (80% of dimensions)
  return centerCrop(
    makeAspectCrop(
      { unit: '%', width: 80 },
      mediaWidth / mediaHeight,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

async function getCroppedBlob(image, crop, originalFile) {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = Math.round(crop.width * scaleX);
  canvas.height = Math.round(crop.height * scaleY);

  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        // Preserve original filename
        const croppedFile = new File([blob], originalFile.name, { type: blob.type });
        resolve(croppedFile);
      },
      originalFile.type || 'image/jpeg',
      0.92
    );
  });
}

function ImageCropModal({ file, onConfirm, onSkip, onCancel }) {
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);
  const objectUrl = useRef(URL.createObjectURL(file));

  // Cleanup object URL on unmount
  React.useEffect(() => {
    const url = objectUrl.current;
    return () => URL.revokeObjectURL(url);
  }, []);

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    setCrop(centerFreeformCrop(width, height));
  };

  const handleCropConfirm = async () => {
    if (!completedCrop || !imgRef.current) {
      // No crop drawn — treat as skip
      onSkip(file);
      return;
    }
    const croppedFile = await getCroppedBlob(imgRef.current, completedCrop, file);
    onConfirm(croppedFile);
  };

  return (
    <div className="icm-overlay" onClick={onCancel}>
      <div className="icm-container" onClick={(e) => e.stopPropagation()}>
        <div className="icm-header">
          <CropIcon size={18} />
          <span className="icm-title">Crop Image</span>
          <button className="icm-close" onClick={onCancel} aria-label="Cancel">
            <X size={20} />
          </button>
        </div>

        <div className="icm-hint">
          Drag to adjust the crop area, or skip to upload the original.
          <br />
          <span className="icm-hint-sub">Product thumbnails display at approximately 16:10 landscape ratio.</span>
        </div>

        <div className="icm-crop-area">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
          >
            <img
              ref={imgRef}
              src={objectUrl.current}
              alt="Crop preview"
              className="icm-image"
              onLoad={onImageLoad}
            />
          </ReactCrop>
        </div>

        <div className="icm-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-secondary" onClick={() => onSkip(file)}>
            <Upload size={16} />
            Skip &amp; Upload Original
          </button>
          <button className="btn btn-primary" onClick={handleCropConfirm}>
            <CropIcon size={16} />
            Crop &amp; Upload
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImageCropModal;
