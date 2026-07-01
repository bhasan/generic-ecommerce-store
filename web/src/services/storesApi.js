// web/src/services/storesApi.js
import { get } from './api';

export const getStores = () => get('/stores');
