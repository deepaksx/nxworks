import axios from 'axios';

const API_BASE = '/api/workshops';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

// Workshops
export const getWorkshops = () => api.get('/');
export const getWorkshop = (id) => api.get(`/${id}`);
export const createWorkshop = (data) => api.post('/', data);
export const updateWorkshop = (id, data) => api.put(`/${id}`, data);
export const deleteWorkshop = (id) => api.delete(`/${id}`);

// Entities (within workshop)
export const getEntities = (workshopId) => api.get(`/${workshopId}/entities`);
export const createEntity = (workshopId, data) => api.post(`/${workshopId}/entities`, data);
export const updateEntity = (workshopId, entityId, data) => api.put(`/${workshopId}/entities/${entityId}`, data);
export const deleteEntity = (workshopId, entityId) => api.delete(`/${workshopId}/entities/${entityId}`);

// Sessions (within workshop)
export const getSessions = (workshopId) => api.get(`/${workshopId}/sessions`);
export const createSession = (workshopId, data) => api.post(`/${workshopId}/sessions`, data);
export const updateSession = (workshopId, sessionId, data) => api.put(`/${workshopId}/sessions/${sessionId}`, data);
export const deleteSession = (workshopId, sessionId) => api.delete(`/${workshopId}/sessions/${sessionId}`);

// Generate questions for a session
export const generateSessionQuestions = (workshopId, sessionId) =>
  api.post(`/${workshopId}/sessions/${sessionId}/generate`);

export default api;
