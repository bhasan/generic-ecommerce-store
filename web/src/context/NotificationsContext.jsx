import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import * as notificationsApi from '../services/notificationsApi';
import { hasAnyRole, ROLES } from '../utils/roles';
import { useAuthContext } from './AuthContext';

const NotificationsContext = createContext(null);

const parsePollingInterval = (rawValue, fallback) => {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const NOTIFICATION_POLL_INTERVAL_MS = parsePollingInterval(import.meta.env.VITE_NOTIFICATION_POLL_INTERVAL_MS, 60000);
const STAFF_COUNTS_POLL_INTERVAL_MS = parsePollingInterval(import.meta.env.VITE_STAFF_COUNTS_POLL_INTERVAL_MS, 60000);

export const useNotificationsContext = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotificationsContext must be used within NotificationsProvider');
  return ctx;
};

export function NotificationsProvider({ children }) {
  const { isAuthenticated, currentUser } = useAuthContext();

  const [staffNotificationCounts, setStaffNotificationCounts] = useState(null);
  const [inboxNotifications, setInboxNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsMuted, setNotificationsMuted] = useState(
    () => sessionStorage.getItem('notificationsMuted') === 'true'
  );

  const hasInteractedRef = useRef(false);
  const hasLoadedNotificationsRef = useRef(false);
  const knownAttentionNotificationIdsRef = useRef(new Set());

  useEffect(() => {
    const markInteracted = () => { hasInteractedRef.current = true; };
    window.addEventListener('pointerdown', markInteracted, { once: true });
    window.addEventListener('keydown', markInteracted, { once: true });
    return () => {
      window.removeEventListener('pointerdown', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
  }, []);

  const playStaffAttentionSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
    oscillator.onended = () => audioContext.close().catch(() => {});
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return [];
    try {
      const data = await notificationsApi.getNotifications();
      setInboxNotifications(data);
      return data;
    } catch { return []; }
  }, [isAuthenticated]);

  const loadUnreadNotificationCount = useCallback(async () => {
    if (!isAuthenticated) return { count: 0 };
    try {
      const data = await notificationsApi.getUnreadNotificationCount();
      setUnreadNotificationCount(data.count ?? 0);
      return data;
    } catch { return { count: 0 }; }
  }, [isAuthenticated]);

  const refreshNotifications = useCallback(async ({ includeList = true } = {}) => {
    if (!isAuthenticated) return { notifications: [], unreadCount: 0 };
    const unread = await loadUnreadNotificationCount();
    if (!includeList) return { notifications: [], unreadCount: unread.count ?? 0 };
    const notifications = await loadNotifications();
    const isStaffUser = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    const attentionIds = new Set(
      notifications.filter(item => item.requiresAttention && !item.readAt).map(item => item.id)
    );
    if (!hasLoadedNotificationsRef.current) {
      hasLoadedNotificationsRef.current = true;
      knownAttentionNotificationIdsRef.current = attentionIds;
      return { notifications, unreadCount: unread.count ?? 0 };
    }
    const newAttentionIds = [...attentionIds].filter(id => !knownAttentionNotificationIdsRef.current.has(id));
    knownAttentionNotificationIdsRef.current = attentionIds;
    if (isStaffUser && newAttentionIds.length > 0 && !notificationsMuted && hasInteractedRef.current) {
      playStaffAttentionSound();
    }
    return { notifications, unreadCount: unread.count ?? 0 };
  }, [currentUser, isAuthenticated, loadNotifications, loadUnreadNotificationCount, notificationsMuted, playStaffAttentionSound]);

  const loadStaffNotificationCounts = useCallback(async () => {
    if (!isAuthenticated) { setStaffNotificationCounts(null); return; }
    const isStaff = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    if (!isStaff) { setStaffNotificationCounts(null); return; }
    try {
      const data = await notificationsApi.getStaffNotificationCounts();
      setStaffNotificationCounts(data);
    } catch { /* silent */ }
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    void loadStaffNotificationCounts();
    if (!isAuthenticated) {
      setStaffNotificationCounts(null);
      setInboxNotifications([]);
      setUnreadNotificationCount(0);
      hasLoadedNotificationsRef.current = false;
      knownAttentionNotificationIdsRef.current = new Set();
      return;
    }
    const isStaff = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    if (!isStaff) return;
    const interval = setInterval(() => void loadStaffNotificationCounts(), STAFF_COUNTS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadStaffNotificationCounts, isAuthenticated, currentUser]);

  useEffect(() => {
    void refreshNotifications({ includeList: true });
    if (!isAuthenticated) return;
    const interval = setInterval(() => void refreshNotifications({ includeList: false }), NOTIFICATION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshNotifications, isAuthenticated]);

  const toggleNotificationsMuted = useCallback(() => {
    setNotificationsMuted(prev => {
      const next = !prev;
      sessionStorage.setItem('notificationsMuted', String(next));
      return next;
    });
  }, []);

  const markNotificationRead = useCallback(async (notificationId) => {
    const now = new Date().toISOString();
    setInboxNotifications(prev => prev.map(item =>
      item.id === notificationId && !item.readAt ? { ...item, readAt: now } : item
    ));
    setUnreadNotificationCount(prev => Math.max(0, prev - 1));
    knownAttentionNotificationIdsRef.current = new Set(
      [...knownAttentionNotificationIdsRef.current].filter(id => id !== notificationId)
    );
    try {
      await notificationsApi.markNotificationRead(notificationId);
    } finally {
      await refreshNotifications({ includeList: true });
    }
  }, [refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    await notificationsApi.markAllNotificationsRead();
    await refreshNotifications({ includeList: true });
  }, [refreshNotifications]);

  const handleNotificationsPanelOpen = useCallback(async () => {
    await refreshNotifications({ includeList: true });
  }, [refreshNotifications]);

  return (
    <NotificationsContext.Provider value={{
      inboxNotifications, unreadNotificationCount, staffNotificationCounts, notificationsMuted,
      loadNotifications, loadUnreadNotificationCount, loadStaffNotificationCounts,
      refreshNotifications, handleNotificationsPanelOpen,
      markNotificationRead, markAllNotificationsRead, toggleNotificationsMuted,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}
