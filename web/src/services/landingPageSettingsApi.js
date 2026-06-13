import { get, put } from './api';

export const getLandingPageSettings = () => get('/landing-page-settings');
export const updateLandingPageSettings = (data) => put('/landing-page-settings', data);
