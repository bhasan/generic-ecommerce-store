import { get, put } from './api';

export const getStoreSettings = () => get('/store-settings');
export const updateStoreSettings = (data) => put('/store-settings', data);
