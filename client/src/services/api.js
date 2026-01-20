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

// File uploads - use plain axios to avoid default JSON content-type
export const uploadAudio = (answerId, formData) =>
  axios.post(`/api/answers/${answerId}/audio`, formData);

export const uploadDocument = (answerId, formData) =>
  axios.post(`/api/answers/${answerId}/document`, formData);

export const deleteAudio = (audioId) => api.delete(`/answers/audio/${audioId}`);
export const deleteDocument = (docId) => api.delete(`/answers/document/${docId}`);
export const resetQuestionData = (questionId) => api.delete(`/answers/question/${questionId}/reset`);
export const transcribeAudio = (audioId) => api.post(`/transcribe/${audioId}`);
export const createObservation = (questionId) => api.post(`/observation/question/${questionId}`);
export const createInitialChecklist = (questionId, force = false) =>
  api.post(`/observation/question/${questionId}/initial${force ? '?force=true' : ''}`);
export const getObservation = (questionId) => api.get(`/observation/question/${questionId}`);
export const getAllObservations = (questionId) => api.get(`/observation/question/${questionId}/all`);
export const getSessionObservations = (sessionId) => api.get(`/observation/session/${sessionId}/all`);

// Participants
export const getParticipants = (sessionId) => api.get(`/participants/session/${sessionId}`);
export const addParticipant = (sessionId, data) => api.post(`/participants/session/${sessionId}`, data);
export const addParticipantsBulk = (sessionId, participants) =>
  api.post(`/participants/session/${sessionId}/bulk`, { participants });
export const updateParticipant = (id, data) => api.patch(`/participants/${id}`, data);
export const deleteParticipant = (id) => api.delete(`/participants/${id}`);
export const toggleParticipantPresence = (id, is_present) =>
  api.patch(`/participants/${id}/presence`, { is_present });

// Reports
export const getSessionReportStatus = (sessionId) => api.get(`/reports/session/${sessionId}/status`);
export const getSessionReports = (sessionId) => api.get(`/reports/session/${sessionId}`);
export const getReport = (reportId) => api.get(`/reports/${reportId}`);
export const generateReport = (sessionId) => api.post(`/reports/session/${sessionId}/generate`);
export const updateReportStatus = (reportId, status) => api.patch(`/reports/${reportId}/status`, { status });
export const deleteReport = (reportId) => api.delete(`/reports/${reportId}`);
export const exportReportPDF = (reportId) => `/api/reports/${reportId}/export/pdf`;
export const exportSessionPDF = (sessionId) => `/api/reports/session/${sessionId}/export/pdf`;

export default api;
