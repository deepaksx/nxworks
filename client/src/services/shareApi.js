import axios from 'axios';

const API_BASE = '/api';

// ============================================
// Admin endpoints (manage sharing)
// ============================================

export const enableSharing = (workshopId, sessionId, username) =>
  axios.post(`${API_BASE}/workshops/${workshopId}/sessions/${sessionId}/share/enable`, { username });

export const disableSharing = (workshopId, sessionId) =>
  axios.post(`${API_BASE}/workshops/${workshopId}/sessions/${sessionId}/share/disable`);

export const getShareStatus = (workshopId, sessionId) =>
  axios.get(`${API_BASE}/workshops/${workshopId}/sessions/${sessionId}/share/status`);

export const regeneratePassword = (workshopId, sessionId) =>
  axios.post(`${API_BASE}/workshops/${workshopId}/sessions/${sessionId}/share/regenerate-password`);

// ============================================
// Public endpoints (shared access)
// ============================================

// Create authenticated axios instance for share endpoints
const createShareApi = (token) => {
  return axios.create({
    baseURL: API_BASE,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

// Get session info (no auth needed)
export const getShareInfo = (shareToken) =>
  axios.get(`${API_BASE}/share/${shareToken}/info`);

// Login and acquire lock
export const shareLogin = (shareToken, username, password) =>
  axios.post(`${API_BASE}/share/${shareToken}/login`, { username, password });

// Heartbeat to keep lock alive (requires auth)
export const shareHeartbeat = (shareToken, authToken) =>
  createShareApi(authToken).post(`/share/${shareToken}/heartbeat`);

// Release lock (requires auth)
export const shareRelease = (shareToken, authToken) =>
  createShareApi(authToken).post(`/share/${shareToken}/release`);

// Get checklist (requires auth)
export const getShareChecklist = (shareToken, authToken) =>
  createShareApi(authToken).get(`/share/${shareToken}/checklist`);

// Get checklist stats (requires auth)
export const getShareChecklistStats = (shareToken, authToken) =>
  createShareApi(authToken).get(`/share/${shareToken}/checklist/stats`);

// Upload audio (requires auth)
export const uploadShareAudio = (shareToken, authToken, formData) =>
  axios.post(`${API_BASE}/share/${shareToken}/audio`, formData, {
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

// Analyze audio (requires auth)
export const analyzeShareAudio = (shareToken, authToken, audioId) =>
  createShareApi(authToken).post(`/share/${shareToken}/audio/${audioId}/analyze`);

export default {
  enableSharing,
  disableSharing,
  getShareStatus,
  regeneratePassword,
  getShareInfo,
  shareLogin,
  shareHeartbeat,
  shareRelease,
  getShareChecklist,
  getShareChecklistStats,
  uploadShareAudio,
  analyzeShareAudio
};
