import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import './AnnouncementBanner.css';
import { X, Megaphone } from 'lucide-react';
import * as announcementsApi from '../../services/announcementsApi';
import { useApp } from '../../context/AppContext';
import { isGuest } from '../../utils/roles';

function AnnouncementBanner() {
  const { currentUser } = useApp();
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(true);
  const [announcement, setAnnouncement] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnnouncements = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await announcementsApi.getActiveAnnouncements();
      const announcements = Array.isArray(data) ? data : [];
      if (announcements.length > 0) {
        const activeAnnouncement = announcements.find(a => a.enabled !== false) || announcements[0];
        if (activeAnnouncement?.message) {
          setAnnouncement(activeAnnouncement);
          setIsVisible(true);
        } else {
          setAnnouncement(null);
        }
      } else {
        setAnnouncement(null);
      }
    } catch {
      setAnnouncement(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only load announcements for authenticated users
    if (isLoading || !currentUser || isGuest(currentUser)) {
      return;
    }
    loadAnnouncements();
  }, [loadAnnouncements, currentUser, isLoading]);

  if (
    isLoading || 
    !currentUser || 
    isGuest(currentUser) || 
    !isVisible || 
    !announcement || 
    !announcement.message
  ) return null;

  // Map backend type (INFO, WARNING, SUCCESS) to CSS class (info, warning, success)
  const typeClass = announcement.type ? announcement.type.toLowerCase() : 'info';

  return (
    <div className={`announcement-banner announcement-${typeClass}`}>
      <div className="announcement-container">
        <div className="announcement-icon">
          <Megaphone size={20} />
        </div>
        <div className="announcement-content">
          <div className="announcement-title">
            Announcement
          </div>
          <p className="announcement-message">{announcement.message}</p>
        </div>
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