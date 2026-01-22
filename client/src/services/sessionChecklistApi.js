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

// Get additional findings for a session
export const getSessionFindings = (sessionId) =>
  api.get(`/session/${sessionId}/findings`);

// Delete a finding
export const deleteFinding = (sessionId, findingId) =>
  api.delete(`/session/${sessionId}/findings/${findingId}`);

// Generate checklist stream URL (for SSE)
export const getGenerateChecklistStreamUrl = (workshopId, sessionId) =>
  `/api/workshops/${workshopId}/sessions/${sessionId}/generate-checklist-stream`;

// Export checklist to Excel - returns URL for download
export const getExportExcelUrl = (sessionId) =>
  `/api/session-checklist/session/${sessionId}/export-excel`;

// Upload document for analysis
export const uploadSessionDocument = (sessionId, formData) =>
  axios.post(`${API_BASE}/session/${sessionId}/document`, formData);

// Analyze uploaded document
export const analyzeSessionDocument = (sessionId, documentId) =>
  api.post(`/session/${sessionId}/document/${documentId}/analyze`);

// Get all documents for a session
export const getSessionDocuments = (sessionId) =>
  api.get(`/session/${sessionId}/documents`);

// Delete a document
export const deleteSessionDocument = (sessionId, documentId) =>
  api.delete(`/session/${sessionId}/document/${documentId}`);

// Get transcript content
export const getSessionTranscript = (sessionId) =>
  api.get(`/session/${sessionId}/transcript`);

// Download transcript URL
export const getTranscriptDownloadUrl = (sessionId) =>
  `${API_BASE}/session/${sessionId}/transcript/download`;

// Regenerate transcript from saved recordings
export const regenerateTranscript = (sessionId) =>
  api.post(`/session/${sessionId}/transcript/regenerate`);

// Re-analyze all transcripts against checklist
export const reanalyzeSession = (sessionId) =>
  api.post(`/session/${sessionId}/reanalyze`);

export default api;
