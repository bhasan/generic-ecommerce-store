import React, { useState } from 'react';
import { X, Megaphone } from 'lucide-react';

function AnnouncementBanner() {
  const [isVisible, setIsVisible] = useState(true);
  
  // In a real app, this would come from an API or admin panel
  const announcement = {
    message: "Test Annoucement message",
    type: "info", // info, warning, success
    dismissible: true
  };

  if (!isVisible || !announcement.message) return null;

  return (
    <div className={`announcement-banner announcement-${announcement.type}`}>
      <div className="announcement-container">
        <div className="announcement-icon">
          <Megaphone size={20} />
        </div>
        <p className="announcement-message">{announcement.message}</p>
        {announcement.dismissible && (
          <button 
            onClick={() => setIsVisible(false)}
            className="announcement-close"
            aria-label="Dismiss announcement"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

export default AnnouncementBanner;