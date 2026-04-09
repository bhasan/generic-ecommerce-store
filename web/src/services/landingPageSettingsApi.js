import { get, put } from './api';

export const getLandingPageSettings = async () => {
  try {
    return await get('/landing-page-settings');
  } catch (error) {
    throw error;
  }
};

export const updateLandingPageSettings = async (data) => {
  try {
    return await put('/landing-page-settings', data);
  } catch (error) {
    throw error;
  }
};
