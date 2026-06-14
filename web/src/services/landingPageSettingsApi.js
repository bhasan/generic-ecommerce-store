import { createSettingsApi } from './createSettingsApi';

const api = createSettingsApi('/landing-page-settings');

export const getLandingPageSettings = () => api.get();
export const updateLandingPageSettings = (data) => api.update(data);
