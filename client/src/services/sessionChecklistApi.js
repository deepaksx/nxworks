import axios from 'axios';

const API_BASE = '/api/session-checklist';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Get session checklist (grouped by status: missing, obtained)
export const getSessionChecklist = (sessionId) =>
  api.get(`/session/${sessionId}`);

// Get session checklist stats
export const getSessionChecklistStats = (sessionId) =>
  api.get(`/session/${sessionId}/stats`);

// Get checklist items by category
export const getChecklistByCategory = (sessionId) =>
  api.get(`/session/${sessionId}/by-category`);

// Upload audio recording for session (checklist mode)
export const uploadSessionAudio = (sessionId, formData) =>
  axios.post(`${API_BASE}/session/${sessionId}/audio`, formData);

// Transcribe and analyze session audio against checklist
export const analyzeSessionAudio = (sessionId, audioId) =>
  api.post(`/session/${sessionId}/audio/${audioId}/analyze`);

// Manual update of checklist item
export const updateChecklistItem = (sessionId, itemId, data) =>
  api.patch(`/session/${sessionId}/item/${itemId}`, data);

// Get all recordings for a session
export const getSessionRecordings = (sessionId) =>
  api.get(`/session/${sessionId}/recordings`);

// Generate checklist stream URL (for SSE)
export const getGenerateChecklistStreamUrl = (workshopId, sessionId) =>
  `/api/workshops/${workshopId}/sessions/${sessionId}/generate-checklist-stream`;

export default api;
