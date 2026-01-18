import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Sessions
export const getSessions = () => api.get('/sessions');
export const getSession = (id) => api.get(`/sessions/${id}`);
export const updateSessionStatus = (id, status) => api.patch(`/sessions/${id}/status`, { status });
export const getSessionProgress = (id) => api.get(`/sessions/${id}/progress`);

// Questions
export const getQuestions = (params) => api.get('/questions', { params });
export const getQuestion = (id) => api.get(`/questions/${id}`);
export const getQuestionsByCategory = (sessionId, entityId) =>
  api.get(`/questions/session/${sessionId}/by-category`, { params: { entity_id: entityId } });

// Answers
export const saveAnswer = (questionId, data) => api.post(`/answers/question/${questionId}`, data);
export const getAnswer = (answerId) => api.get(`/answers/${answerId}`);
export const bulkUpdateStatus = (questionIds, status) =>
  api.post('/answers/bulk-status', { question_ids: questionIds, status });

// File uploads
export const uploadAudio = (answerId, formData) =>
  api.post(`/answers/${answerId}/audio`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const uploadDocument = (answerId, formData) =>
  api.post(`/answers/${answerId}/document`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const deleteAudio = (audioId) => api.delete(`/answers/audio/${audioId}`);
export const deleteDocument = (docId) => api.delete(`/answers/document/${docId}`);

export default api;
