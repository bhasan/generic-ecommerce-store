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
  // crop is a PixelCrop (rendered pixel space); scale up to natural image pixels
  const scaleX = image.naturalWidth / image.clientWidth;
  const scaleY = image.naturalHeight / image.clientHeight;

  canvas.width = Math.round(crop.width * scaleX);
  canvas.height = Math.round(crop.height * scaleY);

  if (canvas.width === 0 || canvas.height === 0) return null;

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
  const [crop, setCrop] = useState(undefined);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [objectUrl, setObjectUrl] = useState(null);
  const imgRef = useRef(null);
  const naturalSize = useRef({ width: 0, height: 0 });

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImageLoad = (e) => {
    const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
    naturalSize.current = { width, height };
    if (width && height) {
      setCrop(centerFreeformCrop(width, height));
    }
  };

  const applyAspectCrop = (aspect) => {
    const { width, height } = naturalSize.current;
    if (!width || !height) return;
    const next = centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, aspect, width, height),
      width,
      height
    );
    setCrop(next);
    setCompletedCrop(null); // clear completed until user finalises
  };

  const handleCropConfirm = async () => {
    if (!completedCrop || !imgRef.current) {
      onSkip(file);
      return;
    }
    const croppedFile = await getCroppedBlob(imgRef.current, completedCrop, file);
    if (!croppedFile) {
      onSkip(file);
      return;
    }
    onConfirm(croppedFile);
  };

  return (
    <div className="icm-overlay">
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

        <div className="icm-presets">
          <button className="btn btn-secondary btn-sm" onClick={() => applyAspectCrop(16 / 10)}>
            16:10
          </button>
        </div>

        <div className="icm-crop-area">
          {objectUrl && (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
            >
              <img
                ref={imgRef}
                src={objectUrl}
                alt="Crop preview"
                className="icm-image"
                onLoad={onImageLoad}
              />
            </ReactCrop>
          )}
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
