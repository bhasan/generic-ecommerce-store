// web/src/context/StoreConfigContext.jsx
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import * as configApi from '../services/configApi';
import * as landingPageSettingsApi from '../services/landingPageSettingsApi';
import * as brandingApi from '../services/brandingApi';
import { applyBrandingTokens } from '../utils/colorUtils';
import { useAuthContext } from './AuthContext';

const StoreConfigContext = createContext(null);

export const useStoreConfigContext = () => {
  const ctx = useContext(StoreConfigContext);
  if (!ctx) throw new Error('useStoreConfigContext must be used within StoreConfigProvider');
  return ctx;
};

export function StoreConfigProvider({ children }) {
  const { isAuthenticated, isLoading } = useAuthContext();

  const [taxRate, setTaxRate] = useState(0);
  const [minimumDeliveryOrder, setMinimumDeliveryOrder] = useState(0);
  const [minimumDeliveryOrderEnabled, setMinimumDeliveryOrderEnabled] = useState(false);
  const [deliveryDisabled, setDeliveryDisabled] = useState(false);
  const [deliveryDisabledMessage, setDeliveryDisabledMessage] = useState('');
  const [deliveryRadiusMiles, setDeliveryRadiusMiles] = useState(5);
  const [pickupLocation, setPickupLocation] = useState('');
  const [featuredProductIds, setFeaturedProductIds] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [storeCashappUsername, setStoreCashappUsername] = useState('');
  const [paymentSettings, setPaymentSettings] = useState({
    cashapp: { enabled: true, handle: '' },
    zelle: { enabled: false, handle: '' },
    venmo: { enabled: false, handle: '' },
  });
  const [storeSettings, setStoreSettings] = useState({ name: '', address: '', phoneNumber: '' });
  const [branding, setBranding] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const config = await configApi.getConfig();
      if (!config) return;
      if (typeof config.taxRate === 'number') setTaxRate(config.taxRate);
      if (typeof config.minimumDeliveryOrder === 'number') setMinimumDeliveryOrder(config.minimumDeliveryOrder);
      if (typeof config.minimumDeliveryOrderEnabled === 'boolean') setMinimumDeliveryOrderEnabled(config.minimumDeliveryOrderEnabled);
      if (typeof config.deliveryDisabled === 'boolean') setDeliveryDisabled(config.deliveryDisabled);
      if (typeof config.deliveryDisabledMessage === 'string') setDeliveryDisabledMessage(config.deliveryDisabledMessage);
      if (typeof config.deliveryRadiusMiles === 'number') setDeliveryRadiusMiles(config.deliveryRadiusMiles);
      if (Array.isArray(config.featuredProductIds)) setFeaturedProductIds(config.featuredProductIds);
      if (Array.isArray(config.promotions)) setPromotions(config.promotions);
      if (config.storeSettings) {
        setStoreSettings(config.storeSettings);
        if (typeof config.storeSettings.address === 'string') setPickupLocation(config.storeSettings.address);
      } else if (typeof config.pickupLocation === 'string') {
        setPickupLocation(config.pickupLocation);
      }
      if (config.paymentSettings) {
        setPaymentSettings(config.paymentSettings);
        setStoreCashappUsername(config.paymentSettings.cashapp?.handle || config.storeCashappUsername || '');
      } else if (typeof config.storeCashappUsername === 'string') {
        setStoreCashappUsername(config.storeCashappUsername);
      }
      if (config.branding) {
        setBranding(config.branding);
        applyBrandingTokens(config.branding.customColors);
        if (config.branding.storeName) document.title = config.branding.storeName;
        if (config.branding.faviconUrls?.['32']) {
          const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
          link.rel = 'icon';
          link.href = config.branding.faviconUrls['32'];
          if (!document.head.contains(link)) document.head.appendChild(link);
        }
      }
    } catch (e) {
      console.warn('Failed to load remote config, using defaults.', e);
    }
  }, []);

  const loadLandingPageData = useCallback(async () => {
    try {
      const settings = await landingPageSettingsApi.getLandingPageSettings();
      if (settings && Array.isArray(settings.featuredProductIds)) setFeaturedProductIds(settings.featuredProductIds);
      if (settings && Array.isArray(settings.promotions)) setPromotions(settings.promotions);
    } catch { /* non-fatal */ }
  }, []);

  const refreshLandingPageData = useCallback(async () => {
    if (isLoading || !isAuthenticated) return;
    await loadLandingPageData();
  }, [isLoading, isAuthenticated, loadLandingPageData]);

  // Public brand identity (name/logo/favicon/colors) — fetched for EVERYONE,
  // including the unauthenticated login/register page, so it shows the store's brand.
  const loadPublicBranding = useCallback(async () => {
    try {
      const b = await brandingApi.getPublicBranding();
      if (!b) return;
      setBranding((prev) => ({ ...(prev || {}), ...b }));
      applyBrandingTokens(b.customColors);
      if (b.storeName) document.title = b.storeName;
      if (b.faviconUrls?.['32']) {
        const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
        link.rel = 'icon';
        link.href = b.faviconUrls['32'];
        if (!document.head.contains(link)) document.head.appendChild(link);
      }
    } catch { /* non-fatal: login page falls back to the default theme */ }
  }, []);

  useEffect(() => {
    loadPublicBranding();
  }, [loadPublicBranding]);

  // Full store config (store/payment/ordering settings + catalog) is login-gated.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    loadConfig();
  }, [loadConfig, isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      loadLandingPageData();
    }
  }, [loadLandingPageData, isAuthenticated, isLoading]);

  return (
    <StoreConfigContext.Provider value={{
      taxRate, minimumDeliveryOrder, minimumDeliveryOrderEnabled,
      deliveryDisabled, deliveryDisabledMessage, deliveryRadiusMiles,
      pickupLocation, featuredProductIds, promotions,
      storeCashappUsername, paymentSettings, storeSettings, branding,
      loadConfig, loadLandingPageData, refreshLandingPageData, loadPublicBranding,
    }}>
      {children}
    </StoreConfigContext.Provider>
  );
}
