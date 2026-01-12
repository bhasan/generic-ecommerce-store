import React, { useState, useEffect, useCallback } from 'react';
import './AnnouncementBanner.css';
import { X, Megaphone } from 'lucide-react';
import * as announcementsApi from '../../services/announcementsApi';

function AnnouncementBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const [announcement, setAnnouncement] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnnouncements = useCallback(async () => {
    try {
      setIsLoading(true);
      const announcements = await announcementsApi.getActiveAnnouncements();
      console.log('Loaded announcements:', announcements);
      // Show the first active announcement
      if (announcements && announcements.length > 0) {
        const activeAnnouncement = announcements.find(a => a.enabled !== false) || announcements[0];
        if (activeAnnouncement && activeAnnouncement.message) {
          setAnnouncement(activeAnnouncement);
          setIsVisible(true);
        } else {
          setAnnouncement(null);
        }
      } else {
        setAnnouncement(null);
      }
    } catch (error) {
      console.error('Failed to load announcements:', error);
      console.error('Error details:', error.message, error.status);
      setAnnouncement(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  if (isLoading || !isVisible || !announcement || !announcement.message) return null;

  // Map backend type (INFO, WARNING, SUCCESS) to CSS class (info, warning, success)
  const typeClass = announcement.type ? announcement.type.toLowerCase() : 'info';

  return (
    <div className={`announcement-banner announcement-${typeClass}`}>
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