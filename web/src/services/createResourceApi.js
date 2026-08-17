import { get, post, put, patch, del } from './api';

export function createResourceApi(endpoint, resourceKey) {
  return {
    getAll: () => get(endpoint),
    getById: (id) => get(`${endpoint}/${id}`),
    create: (data) => post(endpoint, data),
    update: (id, data) => put(`${endpoint}/${id}`, data),
    patch: (id, data) => patch(`${endpoint}/${id}`, data),
    remove: (id) => del(`${endpoint}/${id}`),
  };
}
