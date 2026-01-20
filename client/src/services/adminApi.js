import axios from 'axios';

const API_BASE = '/api/admin';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Global Workshop Config
export const getWorkshopConfig = () => api.get('/config');
export const saveWorkshopConfig = (data) => api.post('/config', data);

// Entities
export const getEntities = () => api.get('/entities');
export const createEntity = (data) => api.post('/entities', data);
export const updateEntity = (id, data) => api.put(`/entities/${id}`, data);
export const deleteEntity = (id) => api.delete(`/entities/${id}`);

// Global Audience Profiles
export const getAudienceProfiles = () => api.get('/audience');
export const addAudienceProfile = (data) => api.post('/audience', data);
export const deleteAudienceProfile = (id) => api.delete(`/audience/${id}`);

// Sessions Management
export const getAdminSessions = () => api.get('/sessions');
export const createSession = (data) => api.post('/sessions', data);
export const updateSession = (id, data) => api.put(`/sessions/${id}`, data);
export const deleteSession = (id) => api.delete(`/sessions/${id}`);

// Question Generation
export const generateAllQuestions = () => api.post('/generate-all');
export const generateSessionQuestions = (sessionId) => api.post(`/generate/${sessionId}`);
export const getAllGeneratedQuestions = () => api.get('/generated');
export const getGeneratedQuestions = (sessionId, status) =>
  api.get(`/generated/${sessionId}`, { params: status ? { status } : {} });
export const updateGeneratedQuestion = (id, data) => api.put(`/generated/${id}`, data);
export const bulkUpdateQuestions = (ids, status) =>
  api.post('/generated/bulk-update', { ids, status });
export const publishAllQuestions = () => api.post('/publish-all');
export const regenerateQuestion = (id, feedback) =>
  api.post(`/generated/${id}/regenerate`, { feedback });

export default api;
