import { get, post, put, patch, del } from './api';

export function createResourceApi(endpoint, resourceKey) {
  return {
    getAll: () => get(endpoint),
    getById: (id) => get(`${endpoint}/${id}`),
    create: async (data) => {
      const response = await post(endpoint, data);
      return response[resourceKey] || response;
    },
    update: async (id, data) => {
      const response = await put(`${endpoint}/${id}`, data);
      return response[resourceKey] || response;
    },
    patch: async (id, data) => {
      const response = await patch(`${endpoint}/${id}`, data);
      return response[resourceKey] || response;
    },
    remove: (id) => del(`${endpoint}/${id}`),
  };
}
