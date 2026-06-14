import { get, put } from './api';

export function createSettingsApi(endpoint) {
  return {
    get: () => get(endpoint),
    update: (data) => put(endpoint, data),
  };
}
