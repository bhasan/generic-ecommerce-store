import { get, post } from './api';

export const getUserCredit = async (userId) => {
  const response = await get(`/storecredit/${userId}`);
  return response;
};

export const getStoreCreditTransactions = async (userId) => {
  const response = await get(`/storecredit/${userId}/transactions`);
  return response;
};

export const addCredit = async (userId, amount, note) => {
  const payload = { amount };
  if (note) payload.note = note;
  const response = await post(`/storecredit/${userId}/add`, payload);
  return response;
};

export const removeCredit = async (userId, amount, note) => {
  const payload = { amount };
  if (note) payload.note = note;
  const response = await post(`/storecredit/${userId}/remove`, payload);
  return response;
};
