import { get } from './api';
import { createResourceApi } from './createResourceApi';

const api = createResourceApi('/announcements', 'announcement');

export const getActiveAnnouncements = () => get('/announcements/active');
export const getAllAnnouncements = api.getAll;
export const getAnnouncementById = api.getById;
export const createAnnouncement = api.create;
export const updateAnnouncement = api.patch;
export const deleteAnnouncement = api.remove;
