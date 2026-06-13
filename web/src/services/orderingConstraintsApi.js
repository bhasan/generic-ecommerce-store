import { get, put } from './api';

export const getOrderingConstraints = () => get('/ordering-constraints');
export const updateOrderingConstraints = (data) => put('/ordering-constraints', data);
