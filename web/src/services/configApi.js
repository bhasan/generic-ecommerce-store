import { get } from './api';

export const getConfig = async () => {
  return await get('/config');
};
