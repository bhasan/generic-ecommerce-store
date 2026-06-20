import { createResourceApi } from './createResourceApi';

const api = createResourceApi('/categories', 'category');

export const getAllCategories = api.getAll;
export const createCategory = api.create;
export const updateCategory = api.update;
export const deleteCategory = api.remove;
