// web/src/services/storesApi.js
import { get, post, patch } from './api';

// Customer-facing: ACTIVE stores only (feeds the store picker).
export const getStores = () => get('/stores');

// Admin: all stores including SUSPENDED (feeds the store management screen).
export const getManagedStores = () => get('/stores/manage');

// Admin store CRUD.
export const createStore = (body) => post('/stores', body);
export const updateStore = (id, body) => patch(`/stores/${id}`, body);
export const setDefaultStore = (id) => patch(`/stores/${id}/default`);
export const cloneFromDefault = (id) => post(`/stores/${id}/clone-from-default`);
