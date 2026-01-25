import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useChunkedRecording } from '../hooks/useChunkedRecording';
import ImmersiveRecordingView from './ImmersiveRecordingView';
import {
  getSessionChecklist,
  getSessionChecklistStats,
  uploadSessionAudio,
  analyzeSessionAudio,
  getSessionFindings,
  updateChecklistItem,
  getExportExcelUrl,
  uploadSessionDocument,
  analyzeSessionDocument,
  getSessionDocuments,
  deleteSessionDocument,
  getSessionTranscript,
  getTranscriptDownloadUrl,
  regenerateTranscript,
  reanalyzeSession
} from '../services/sessionChecklistApi';
import {
  Mic,
  Square,
  CheckCircle,
  AlertTriangle,
  Target,
  Loader2,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Lightbulb,
  AlertCircle,
  Info,
  Zap,
  Shield,
  Edit3,
  Save,
  X,
  Download,
  FileUp,
  FileText,
  File,
  Trash2,
  RotateCcw,
  FileDown,
  Eye,
  Users,
  BarChart3,
  List,
  LayoutGrid,
  Maximize2
} from 'lucide-react';

// Fixed chunk duration: 1 minute
const CHUNK_DURATION_SECONDS = 60;

function ChecklistModeView({ workshopId, sessionId, session, participants = [], onShowParticipants, onStatusChange }) {
  const [checklist, setChecklist] = useState({ missing: [], obtained: [] });
  const [stats, setStats] = useState({
    total: 0,
    obtained: 0,
    missing: 0,
    criticalMissing: 0,
    criticalObtained: 0,
    completionPercent: 0
  });
  const [findings, setFindings] = useState({ all: [], stats: { total: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 } });
  const [documents, setDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState('missing');
  const [loading, setLoading] = useState(true);
  const [chunkProcessingStatus, setChunkProcessingStatus] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const documentInputRef = useRef(null);
  const [documentUploadStatus, setDocumentUploadStatus] = useState(null); // null, 'uploading', 'analyzing', 'complete', 'error'
  const [documentUploadMessage, setDocumentUploadMessage] = useState('');
  const [reanalyzeStatus, setReanalyzeStatus] = useState(null); // null, 'analyzing', 'complete', 'error'
  const [reanalyzeResult, setReanalyzeResult] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptContent, setTranscriptContent] = useState('');
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [bestPracticeItem, setBestPracticeItem] = useState(null); // Item to show best practice modal for
  const [implicationsFinding, setImplicationsFinding] = useState(null); // Finding to show implications modal for
  const [selectedFindingsCategory, setSelectedFindingsCategory] = useState(null); // Category to show in popup
  const [retryingChunks, setRetryingChunks] = useState(false); // Retrying failed chunks
  const [headerCollapsed, setHeaderCollapsed] = useState(false); // Collapsible header state
  const [findingsViewMode, setFindingsViewMode] = useState('chart'); // 'chart' or 'list'
  const [findingsFilterCategory, setFindingsFilterCategory] = useState(null);
  const [findingsFilterRisk, setFindingsFilterRisk] = useState(null);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false); // Immersive recording mode


  // Load checklist on mount
  useEffect(() => {
    loadChecklist();
  }, [sessionId]);

  const loadChecklist = async () => {
    try {
      setLoading(true);
      const [checklistRes, statsRes, findingsRes, documentsRes] = await Promise.all([
        getSessionChecklist(sessionId),
        getSessionChecklistStats(sessionId),
        getSessionFindings(sessionId).catch(() => ({ data: { all: [], stats: { total: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 } } })),
        getSessionDocuments(sessionId).catch(() => ({ data: [] }))
      ]);
      setChecklist(checklistRes.data);
      setStats(statsRes.data);
      setFindings(findingsRes.data);
      setDocuments(documentsRes.data);

      // Auto-expand all categories
      const categories = {};
      [...checklistRes.data.missing, ...checklistRes.data.obtained].forEach(item => {
        if (item.category) categories[item.category] = true;
      });
      setExpandedCategories(categories);
    } catch (error) {
      console.error('Error loading checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  // Document upload handler
  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input
    event.target.value = '';

    // Validate file type
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.csv'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowedExtensions.includes(ext)) {
      setDocumentUploadStatus('error');
      setDocumentUploadMessage('Only PDF, Word documents (.doc, .docx), and text files are allowed');
      setTimeout(() => setDocumentUploadStatus(null), 5000);
      return;
    }

    try {
      // Step 1: Upload
      setDocumentUploadStatus('uploading');
      setDocumentUploadMessage(`Uploading ${file.name}...`);

      const formData = new FormData();
      formData.append('document', file);

      const uploadResponse = await uploadSessionDocument(sessionId, formData);
      const documentId = uploadResponse.data.id;

      // Step 2: Analyze
      setDocumentUploadStatus('analyzing');
      setDocumentUploadMessage('Extracting text and analyzing against checklist...');

      const analysisResponse = await analyzeSessionDocument(sessionId, documentId);

      // Step 3: Complete
      setDocumentUploadStatus('complete');
      setDocumentUploadMessage(
        `Done! ${analysisResponse.data.obtainedCount || 0} items obtained, ${analysisResponse.data.findingsCount || 0} findings captured`
      );

      // Reload checklist
      await loadChecklist();

      // Clear status after delay
      setTimeout(() => setDocumentUploadStatus(null), 5000);

    } catch (error) {
      console.error('Error uploading/analyzing document:', error);
      setDocumentUploadStatus('error');
      setDocumentUploadMessage(error.response?.data?.error || error.message || 'Failed to process document');
      setTimeout(() => setDocumentUploadStatus(null), 5000);
    }
  };

  // Delete document handler
  const handleDeleteDocument = async (documentId) => {
    if (!confirm('Delete this document?')) return;
    try {
      await deleteSessionDocument(sessionId, documentId);
      setDocuments(prev => prev.filter(d => d.id !== documentId));
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
    }
  };

  // Re-analyze all transcripts
  const handleReanalyze = async () => {
    if (reanalyzeStatus === 'analyzing') return;

    setReanalyzeStatus('analyzing');
    setReanalyzeResult(null);

    try {
      const response = await reanalyzeSession(sessionId);
      setReanalyzeResult(response.data);
      setReanalyzeStatus('complete');

      // Reload checklist and findings to show updates
      await loadChecklist();

      // Clear status after delay
      setTimeout(() => {
        setReanalyzeStatus(null);
      }, 10000);
    } catch (error) {
      console.error('Error re-analyzing:', error);
      setReanalyzeStatus('error');
      setReanalyzeResult({ error: error.response?.data?.error || error.message });
      setTimeout(() => setReanalyzeStatus(null), 5000);
    }
  };

  // View transcript
  const handleViewTranscript = async () => {
    setTranscriptLoading(true);
    try {
      const response = await getSessionTranscript(sessionId);
      setTranscriptContent(response.data.content);
      setShowTranscript(true);
    } catch (error) {
      console.error('Error loading transcript:', error);
      alert(error.response?.data?.error || 'No transcript available yet');
    } finally {
      setTranscriptLoading(false);
    }
  };

  // Regenerate transcript from recordings
  const handleRegenerateTranscript = async () => {
    if (!confirm('Regenerate transcript from saved recordings? This will rebuild the MD file.')) return;

    try {
      const response = await regenerateTranscript(sessionId);
      alert(`Transcript regenerated! ${response.data.chunksIncluded} chunks included.`);
    } catch (error) {
      console.error('Error regenerating transcript:', error);
      alert(error.response?.data?.error || 'Failed to regenerate transcript');
    }
  };

  // Chunked recording callback - process each audio chunk
  const handleChunkReady = useCallback(async (blob, chunkIndex, duration) => {
    console.log(`Chunk ${chunkIndex} ready (${Math.round(duration)}s)`);

    // Update processing status
    setChunkProcessingStatus(prev => {
      const newStatus = [...prev];
      newStatus[chunkIndex] = { status: 'uploading', step: 1, message: 'Uploading...' };
      return newStatus;
    });

    let audioId = null;

    try {
      // Step 1: Upload audio
      const formData = new FormData();
      formData.append('audio', blob, `session-chunk-${chunkIndex}.webm`);
      formData.append('duration_seconds', Math.round(duration));
      formData.append('chunk_index', chunkIndex);

      const uploadResponse = await uploadSessionAudio(sessionId, formData);
      audioId = uploadResponse.data.id;

      // Step 2: Transcribe and analyze
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        newStatus[chunkIndex] = { status: 'analyzing', step: 2, message: 'Transcribing & analyzing...', audioId };
        return newStatus;
      });

      const analysisResponse = await analyzeSessionAudio(sessionId, audioId);

      // Step 3: Complete
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        newStatus[chunkIndex] = {
          status: 'complete',
          step: 3,
          message: `Done! ${analysisResponse.data.obtainedCount || 0} items obtained`,
          obtainedCount: analysisResponse.data.obtainedCount || 0,
          audioId
        };
        return newStatus;
      });

      // Reload checklist to show updated items
      await loadChecklist();

    } catch (error) {
      console.error(`Error processing chunk ${chunkIndex}:`, error);
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        newStatus[chunkIndex] = {
          status: 'error',
          step: prev[chunkIndex]?.step || 0,
          message: error.response?.data?.error || error.message,
          audioId // Store audioId so we can retry analysis
        };
        return newStatus;
      });
    }
  }, [sessionId]);

  // Retry failed chunks
  const handleRetryFailedChunks = useCallback(async () => {
    const failedWithAudioId = chunkProcessingStatus
      .map((status, index) => ({ ...status, index }))
      .filter(s => s.status === 'error' && s.audioId);

    if (failedWithAudioId.length === 0) {
      alert('No failed chunks with saved audio to retry. You may need to re-record.');
      return;
    }

    setRetryingChunks(true);
    let successCount = 0;
    let failCount = 0;

    for (const chunk of failedWithAudioId) {
      try {
        // Update status to retrying
        setChunkProcessingStatus(prev => {
          const newStatus = [...prev];
          newStatus[chunk.index] = { ...newStatus[chunk.index], status: 'analyzing', message: 'Retrying analysis...' };
          return newStatus;
        });

        const analysisResponse = await analyzeSessionAudio(sessionId, chunk.audioId);

        // Success
        setChunkProcessingStatus(prev => {
          const newStatus = [...prev];
          newStatus[chunk.index] = {
            status: 'complete',
            step: 3,
            message: `Done! ${analysisResponse.data.obtainedCount || 0} items obtained`,
            obtainedCount: analysisResponse.data.obtainedCount || 0,
            audioId: chunk.audioId
          };
          return newStatus;
        });
        successCount++;
      } catch (error) {
        // Still failed
        setChunkProcessingStatus(prev => {
          const newStatus = [...prev];
          newStatus[chunk.index] = {
            status: 'error',
            step: 2,
            message: error.response?.data?.error || error.message,
            audioId: chunk.audioId
          };
          return newStatus;
        });
        failCount++;
      }
    }

    setRetryingChunks(false);
    await loadChecklist();

    if (successCount > 0) {
      alert(`Retry complete! ${successCount} chunk(s) succeeded${failCount > 0 ? `, ${failCount} still failed` : ''}.`);
    } else {
      alert(`All retries failed. Please check your API credits and try again.`);
    }
  }, [chunkProcessingStatus, sessionId]);

  const handleAllChunksComplete = useCallback(async () => {
    console.log('All chunks complete, reloading checklist...');
    await loadChecklist();
  }, []);

  const {
    isRecording,
    recordingTime,
    audioLevel,
    currentChunkTime,
    totalChunks,
    processingChunks,
    completedChunks,
    failedChunks,
    startRecording,
    stopRecording,
    formatTime,
    chunkDurationSeconds
  } = useChunkedRecording({
    onChunkReady: handleChunkReady,
    onAllChunksComplete: handleAllChunksComplete,
    chunkDurationSeconds: CHUNK_DURATION_SECONDS
  });

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Group items by category
  const groupByCategory = (items) => {
    const groups = {};
    items.forEach(item => {
      const cat = item.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  };

  // Group items by importance
  const groupByImportance = (items) => {
    return {
      critical: items.filter(i => i.importance === 'critical'),
      important: items.filter(i => i.importance === 'important'),
      niceToHave: items.filter(i => i.importance === 'nice-to-have')
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const missingGrouped = groupByImportance(checklist.missing);
  const obtainedGrouped = groupByImportance(checklist.obtained);

  // Render immersive recording mode
  if (isImmersiveMode) {
    return (
      <ImmersiveRecordingView
        workshopId={workshopId}
        sessionId={sessionId}
        session={session}
        participants={participants}
        onShowParticipants={onShowParticipants}
        onStatusChange={onStatusChange}
        onExitImmersive={() => {
          setIsImmersiveMode(false);
          loadChecklist(); // Refresh data when exiting
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input for document upload */}
      <input
        type="file"
        ref={documentInputRef}
        onChange={handleDocumentUpload}
        accept=".pdf,.doc,.docx,.txt,.csv"
        className="hidden"
      />

      {/* Unified Collapsible Header */}
      <div className="bg-white rounded-lg shadow-sm border">
        {/* Collapsed Header Bar */}
        {headerCollapsed ? (
          <div className="px-3 py-2 flex items-center gap-3">
            {/* Back button */}
            <Link to={`/workshop/${workshopId}`} className="p-1 hover:bg-gray-100 rounded transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </Link>

            {/* Session name */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-bold text-purple-600">S{session?.session_number}</span>
              <span className="text-sm font-medium text-gray-900 truncate max-w-[120px]">{session?.name}</span>
            </div>

            {/* Mini pie chart with stats */}
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" className="transform -rotate-90">
                <circle cx="12" cy="12" r="10" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                <circle
                  cx="12" cy="12" r="10" fill="none" stroke="#22c55e" strokeWidth="4"
                  strokeDasharray={`${stats.completionPercent * 0.628} 62.8`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                {stats.obtained}/{stats.total}
              </span>
            </div>

            {/* Compact stats */}
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-red-600 whitespace-nowrap">
                <AlertTriangle className="w-3 h-3" />
                {stats.criticalMissing}
              </span>
              <span className="flex items-center gap-1 text-green-600 whitespace-nowrap">
                <CheckCircle className="w-3 h-3" />
                {stats.criticalObtained}
              </span>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Compact action buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => window.open(getExportExcelUrl(sessionId), '_blank')}
                disabled={isRecording || stats.total === 0}
                className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                title="Download Excel Report"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                onClick={() => documentInputRef.current?.click()}
                disabled={documentUploadStatus === 'uploading' || documentUploadStatus === 'analyzing'}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                title="Upload Document"
              >
                {documentUploadStatus === 'uploading' || documentUploadStatus === 'analyzing' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileUp className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={handleReanalyze}
                disabled={isRecording || reanalyzeStatus === 'analyzing' || stats.obtained === 0}
                className="p-1 text-purple-600 hover:bg-purple-50 rounded disabled:opacity-50"
                title="Re-analyze all transcripts"
              >
                {reanalyzeStatus === 'analyzing' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={loadChecklist}
                disabled={isRecording}
                className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* Immersive mode button */}
              <button
                onClick={() => setIsImmersiveMode(true)}
                disabled={isRecording}
                className="p-1 text-purple-600 hover:bg-purple-50 rounded disabled:opacity-50"
                title="Immersive recording mode"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Record button */}
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs rounded-md hover:from-purple-700 hover:to-indigo-700"
                >
                  <Mic className="w-3.5 h-3.5" />
                  Record
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white text-xs rounded-md hover:bg-red-700 animate-pulse"
                >
                  <Square className="w-3 h-3" />
                  {formatTime(recordingTime)}
                </button>
              )}

              {/* Participants */}
              {onShowParticipants && (
                <button
                  onClick={onShowParticipants}
                  className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                >
                  <Users className="w-3.5 h-3.5 text-gray-600" />
                  {participants.length}
                </button>
              )}

              {/* Status dropdown */}
              {onStatusChange && (
                <select
                  value={session?.status || 'not_started'}
                  onChange={(e) => onStatusChange(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              )}

              {/* Expand button */}
              <button
                onClick={() => setHeaderCollapsed(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                title="Expand header"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Expanded Header */
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {/* Back button */}
                <Link to={`/workshop/${workshopId}`} className="p-1 hover:bg-gray-100 rounded transition-colors">
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </Link>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-purple-600">S{session?.session_number}</span>
                    <h2 className="text-lg font-semibold text-gray-900">{session?.name || 'Session'}</h2>
                  </div>
                  <p className="text-sm text-gray-500">Direct Checklist Mode</p>
                </div>
              </div>

              {/* Inline Recording Status - shows in the middle when recording */}
              {isRecording && (
                <div className="flex-1 mx-6 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-sm font-medium text-red-800">Recording in Progress</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-red-700">
                      <Clock className="w-3 h-3" />
                      <span>Total: {formatTime(recordingTime)}</span>
                      <span className="text-red-300">|</span>
                      <span>Chunk: {formatTime(currentChunkTime)} / {formatTime(chunkDurationSeconds)}</span>
                    </div>
                  </div>
                  {/* Audio level bar */}
                  <div className="h-1.5 bg-red-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all duration-75"
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>
                  {/* Chunk status */}
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    {chunkProcessingStatus.length > 0 ? (
                      <>
                        <span className="text-gray-600">
                          Chunks: {chunkProcessingStatus.filter(s => s.status === 'complete').length}/{chunkProcessingStatus.length}
                        </span>
                        <span className="text-green-600 font-medium">
                          +{chunkProcessingStatus.reduce((sum, s) => sum + (s.obtainedCount || 0), 0)} items
                        </span>
                        {chunkProcessingStatus.some(s => s.status === 'uploading' || s.status === 'analyzing') && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Processing...
                          </span>
                        )}
                        {chunkProcessingStatus.some(s => s.status === 'error') && (
                          <>
                            <span className="text-red-600">
                              {chunkProcessingStatus.filter(s => s.status === 'error').length} failed
                            </span>
                            <button
                              onClick={handleRetryFailedChunks}
                              disabled={retryingChunks}
                              className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {retryingChunks ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Retry
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-500">Recording will be analyzed in chunks...</span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                {/* Download Excel button */}
                <button
                  onClick={() => window.open(getExportExcelUrl(sessionId), '_blank')}
                  disabled={isRecording || stats.total === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-green-300 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
                  title="Download Excel Report"
                >
                  <Download className="w-4 h-4" />
                  Excel
                </button>

                {/* Document upload button */}
                <button
                  onClick={() => documentInputRef.current?.click()}
                  disabled={documentUploadStatus === 'uploading' || documentUploadStatus === 'analyzing'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                  title="Upload Document (PDF, Word, TXT)"
                >
                  {documentUploadStatus === 'uploading' || documentUploadStatus === 'analyzing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileUp className="w-4 h-4" />
                  )}
                  Document
                </button>

                {/* Re-analyse button */}
                <button
                  onClick={handleReanalyze}
                  disabled={isRecording || reanalyzeStatus === 'analyzing' || stats.obtained === 0}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 ${
                    reanalyzeStatus === 'complete' ? 'border-green-300 text-green-700 bg-green-50' :
                    reanalyzeStatus === 'error' ? 'border-red-300 text-red-700 bg-red-50' :
                    'border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100'
                  }`}
                  title="Re-analyze all transcripts with stricter criteria"
                >
                  {reanalyzeStatus === 'analyzing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  Re-analyse
                </button>

                <button
                  onClick={loadChecklist}
                  disabled={isRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
                {/* Immersive mode button */}
                <button
                  onClick={() => setIsImmersiveMode(true)}
                  disabled={isRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-purple-300 text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50"
                  title="Enter immersive recording mode"
                >
                  <Maximize2 className="w-4 h-4" />
                  Immersive
                </button>
                {/* Record button */}
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 shadow-md"
                  >
                    <Mic className="w-4 h-4" />
                    Record Session
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 animate-pulse shadow-md"
                  >
                    <Square className="w-4 h-4" />
                    Stop ({formatTime(recordingTime)})
                  </button>
                )}

                {/* Participants */}
                {onShowParticipants && (
                  <button
                    onClick={onShowParticipants}
                    className="flex items-center px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    <Users className="w-4 h-4 mr-1 text-gray-600" />
                    {participants.length}
                  </button>
                )}

                {/* Status dropdown */}
                {onStatusChange && (
                  <select
                    value={session?.status || 'not_started'}
                    onChange={(e) => onStatusChange(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                )}

                {/* Collapse button */}
                <button
                  onClick={() => setHeaderCollapsed(true)}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  title="Collapse header"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick stats with pie chart */}
            <div className="flex items-center gap-4 text-xs">
              {/* Mini pie chart */}
              <div className="flex items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 24 24" className="transform -rotate-90">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="4"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="4"
                    strokeDasharray={`${stats.completionPercent * 0.628} 62.8`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-sm font-medium text-gray-700">
                  {stats.obtained}/{stats.total} ({stats.completionPercent}%)
                </span>
              </div>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                {stats.criticalMissing} critical missing
              </span>
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-3.5 h-3.5" />
                {stats.criticalObtained} critical obtained
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Recording status - Only shown when header is collapsed (expanded header has it inline) */}
      {isRecording && headerCollapsed && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <div className="flex items-center gap-2 text-xs text-red-700">
            <Clock className="w-3 h-3" />
            <span>{formatTime(recordingTime)}</span>
            <span className="text-red-300">|</span>
            <span>Chunk: {formatTime(currentChunkTime)}/{formatTime(chunkDurationSeconds)}</span>
          </div>
          {/* Mini audio level */}
          <div className="w-16 h-1.5 bg-red-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-75"
              style={{ width: `${audioLevel}%` }}
            />
          </div>
          {/* Compact chunk status */}
          {chunkProcessingStatus.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">
                {chunkProcessingStatus.filter(s => s.status === 'complete').length}/{chunkProcessingStatus.length}
              </span>
              <span className="text-green-600 font-medium">
                +{chunkProcessingStatus.reduce((sum, s) => sum + (s.obtainedCount || 0), 0)}
              </span>
              {chunkProcessingStatus.some(s => s.status === 'uploading' || s.status === 'analyzing') && (
                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
              )}
              {chunkProcessingStatus.some(s => s.status === 'error') && (
                <span className="text-red-600">{chunkProcessingStatus.filter(s => s.status === 'error').length} err</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Failed chunks retry bar - shows when not recording but has failed chunks */}
      {!isRecording && chunkProcessingStatus.some(s => s.status === 'error') && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  {chunkProcessingStatus.filter(s => s.status === 'error').length} chunk(s) failed to analyze
                </p>
                <p className="text-xs text-red-600">
                  {chunkProcessingStatus.filter(s => s.status === 'error' && s.audioId).length > 0
                    ? 'Audio saved - click Retry to re-analyze'
                    : 'Audio upload failed - may need to re-record'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {chunkProcessingStatus.filter(s => s.status === 'error' && s.audioId).length > 0 && (
                <button
                  onClick={handleRetryFailedChunks}
                  disabled={retryingChunks}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {retryingChunks ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Retry Failed ({chunkProcessingStatus.filter(s => s.status === 'error' && s.audioId).length})
                </button>
              )}
              <button
                onClick={() => setChunkProcessingStatus([])}
                className="p-1.5 text-red-400 hover:text-red-600 rounded"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document upload status */}
      {documentUploadStatus && (
        <div className={`rounded-lg p-4 border ${
          documentUploadStatus === 'error' ? 'bg-red-50 border-red-200' :
          documentUploadStatus === 'complete' ? 'bg-green-50 border-green-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center gap-3">
            {documentUploadStatus === 'uploading' && (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            )}
            {documentUploadStatus === 'analyzing' && (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            )}
            {documentUploadStatus === 'complete' && (
              <CheckCircle className="w-5 h-5 text-green-600" />
            )}
            {documentUploadStatus === 'error' && (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                documentUploadStatus === 'error' ? 'text-red-800' :
                documentUploadStatus === 'complete' ? 'text-green-800' :
                'text-blue-800'
              }`}>
                {documentUploadStatus === 'uploading' && 'Uploading Document'}
                {documentUploadStatus === 'analyzing' && 'Analyzing Document'}
                {documentUploadStatus === 'complete' && 'Document Analyzed'}
                {documentUploadStatus === 'error' && 'Upload Failed'}
              </p>
              <p className={`text-xs ${
                documentUploadStatus === 'error' ? 'text-red-600' :
                documentUploadStatus === 'complete' ? 'text-green-600' :
                'text-blue-600'
              }`}>
                {documentUploadMessage}
              </p>
            </div>
            {documentUploadStatus !== 'uploading' && documentUploadStatus !== 'analyzing' && (
              <button
                onClick={() => setDocumentUploadStatus(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Re-analyze status */}
      {reanalyzeStatus && (
        <div className={`rounded-lg p-4 border ${
          reanalyzeStatus === 'error' ? 'bg-red-50 border-red-200' :
          reanalyzeStatus === 'complete' ? 'bg-purple-50 border-purple-200' :
          'bg-purple-50 border-purple-200'
        }`}>
          <div className="flex items-start gap-3">
            {reanalyzeStatus === 'analyzing' && (
              <Loader2 className="w-5 h-5 text-purple-600 animate-spin mt-0.5" />
            )}
            {reanalyzeStatus === 'complete' && (
              <CheckCircle className="w-5 h-5 text-purple-600 mt-0.5" />
            )}
            {reanalyzeStatus === 'error' && (
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                reanalyzeStatus === 'error' ? 'text-red-800' : 'text-purple-800'
              }`}>
                {reanalyzeStatus === 'analyzing' && 'Re-analyzing all transcripts...'}
                {reanalyzeStatus === 'complete' && 'Re-analysis Complete'}
                {reanalyzeStatus === 'error' && 'Re-analysis Failed'}
              </p>
              {reanalyzeStatus === 'complete' && reanalyzeResult && (
                <div className="text-xs text-purple-600 mt-1 space-y-1">
                  <p>Changes applied: {reanalyzeResult.changesApplied || 0}</p>
                  <p>Items confirmed obtained: {reanalyzeResult.itemsObtained || 0}</p>
                  {reanalyzeResult.itemsResetToMissing > 0 && (
                    <p className="text-amber-600">Items reset to missing: {reanalyzeResult.itemsResetToMissing}</p>
                  )}
                  {reanalyzeResult.strayTopicsFound > 0 && (
                    <p className="text-green-600">New findings discovered: {reanalyzeResult.strayTopicsFound}</p>
                  )}
                  {reanalyzeResult.summary?.key_concerns?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-purple-200">
                      <p className="font-medium text-purple-700">Key Concerns:</p>
                      <ul className="list-disc list-inside text-purple-600">
                        {reanalyzeResult.summary.key_concerns.slice(0, 3).map((concern, i) => (
                          <li key={i}>{concern}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {reanalyzeStatus === 'error' && reanalyzeResult?.error && (
                <p className="text-xs text-red-600">{reanalyzeResult.error}</p>
              )}
            </div>
            {reanalyzeStatus !== 'analyzing' && (
              <button
                onClick={() => setReanalyzeStatus(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Checklist tabs */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('missing')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'missing'
                ? 'border-b-2 border-red-500 text-red-700 bg-red-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            Missing ({stats.missing})
          </button>
          <button
            onClick={() => setActiveTab('obtained')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'obtained'
                ? 'border-b-2 border-green-500 text-green-700 bg-green-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <CheckCircle className="w-4 h-4 inline mr-2" />
            Obtained ({stats.obtained})
          </button>
          <button
            onClick={() => setActiveTab('findings')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'findings'
                ? 'border-b-2 border-purple-500 text-purple-700 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Lightbulb className="w-4 h-4 inline mr-2" />
            Findings ({findings.stats?.total || 0})
            {findings.stats?.highRisk > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                {findings.stats.highRisk} high
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'documents'
                ? 'border-b-2 border-blue-500 text-blue-700 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Documents ({documents.length})
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {activeTab === 'missing' && (
            <div className="space-y-6">
              {/* Critical Items */}
              {missingGrouped.critical.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Critical ({missingGrouped.critical.length})
                  </h4>
                  <div className="space-y-2">
                    {missingGrouped.critical.map(item => (
                      <MissingItemCard key={item.id} item={item} onShowBestPractice={setBestPracticeItem} />
                    ))}
                  </div>
                </div>
              )}

              {/* Important Items */}
              {missingGrouped.important.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-orange-700 uppercase mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Important ({missingGrouped.important.length})
                  </h4>
                  <div className="space-y-2">
                    {missingGrouped.important.map(item => (
                      <MissingItemCard key={item.id} item={item} onShowBestPractice={setBestPracticeItem} />
                    ))}
                  </div>
                </div>
              )}

              {/* Nice to Have Items */}
              {missingGrouped.niceToHave.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-600 uppercase mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Nice to Have ({missingGrouped.niceToHave.length})
                  </h4>
                  <div className="space-y-2">
                    {missingGrouped.niceToHave.map(item => (
                      <MissingItemCard key={item.id} item={item} importance="nice-to-have" onShowBestPractice={setBestPracticeItem} />
                    ))}
                  </div>
                </div>
              )}

              {checklist.missing.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>All checklist items have been obtained!</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'obtained' && (
            <div className="space-y-6">
              {/* Critical Items */}
              {obtainedGrouped.critical.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Critical ({obtainedGrouped.critical.length})
                  </h4>
                  <div className="space-y-2">
                    {obtainedGrouped.critical.map(item => (
                      <ObtainedItemCard key={item.id} item={item} sessionId={sessionId} onUpdate={loadChecklist} onShowBestPractice={setBestPracticeItem} />
                    ))}
                  </div>
                </div>
              )}

              {/* Important Items */}
              {obtainedGrouped.important.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-green-600 uppercase mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Important ({obtainedGrouped.important.length})
                  </h4>
                  <div className="space-y-2">
                    {obtainedGrouped.important.map(item => (
                      <ObtainedItemCard key={item.id} item={item} sessionId={sessionId} onUpdate={loadChecklist} onShowBestPractice={setBestPracticeItem} />
                    ))}
                  </div>
                </div>
              )}

              {/* Nice to Have Items */}
              {obtainedGrouped.niceToHave.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-600 uppercase mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Nice to Have ({obtainedGrouped.niceToHave.length})
                  </h4>
                  <div className="space-y-2">
                    {obtainedGrouped.niceToHave.map(item => (
                      <ObtainedItemCard key={item.id} item={item} sessionId={sessionId} onUpdate={loadChecklist} onShowBestPractice={setBestPracticeItem} />
                    ))}
                  </div>
                </div>
              )}

              {checklist.obtained.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Target className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>No items obtained yet. Start recording to discuss the checklist.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'findings' && (
            <div className="space-y-4">
              {/* Summary stats and view toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <button
                    onClick={() => setFindingsFilterRisk(null)}
                    className={`px-2 py-1 rounded transition-colors ${!findingsFilterRisk ? 'bg-gray-200 font-medium' : 'hover:bg-gray-100'} text-gray-600`}
                  >
                    Total: <strong>{findings.stats?.total || 0}</strong>
                  </button>
                  <button
                    onClick={() => setFindingsFilterRisk(findingsFilterRisk === 'high' ? null : 'high')}
                    className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${findingsFilterRisk === 'high' ? 'bg-red-100 ring-2 ring-red-500' : 'hover:bg-red-50'} text-red-600`}
                  >
                    <span className="w-3 h-3 bg-red-500 rounded-sm"></span>
                    High: {findings.stats?.highRisk || 0}
                  </button>
                  <button
                    onClick={() => setFindingsFilterRisk(findingsFilterRisk === 'medium' ? null : 'medium')}
                    className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${findingsFilterRisk === 'medium' ? 'bg-yellow-100 ring-2 ring-yellow-500' : 'hover:bg-yellow-50'} text-yellow-600`}
                  >
                    <span className="w-3 h-3 bg-yellow-500 rounded-sm"></span>
                    Medium: {findings.stats?.mediumRisk || 0}
                  </button>
                  <button
                    onClick={() => setFindingsFilterRisk(findingsFilterRisk === 'low' ? null : 'low')}
                    className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${findingsFilterRisk === 'low' ? 'bg-yellow-100 ring-2 ring-yellow-300' : 'hover:bg-yellow-50'} text-yellow-500`}
                  >
                    <span className="w-3 h-3 bg-yellow-300 rounded-sm"></span>
                    Low: {findings.stats?.lowRisk || 0}
                  </button>
                </div>
                {/* View toggle */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setFindingsViewMode('chart')}
                    className={`p-1.5 rounded ${findingsViewMode === 'chart' ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                    title="Chart view"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setFindingsViewMode('tiles')}
                    className={`p-1.5 rounded ${findingsViewMode === 'tiles' ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                    title="Tiles view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setFindingsViewMode('list')}
                    className={`p-1.5 rounded ${findingsViewMode === 'list' ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                    title="List view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Empty state */}
              {(!findings.all || findings.all.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <Lightbulb className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="font-medium">No findings yet</p>
                  <p className="text-sm mt-1">
                    When you discuss topics beyond the checklist, the system will capture them here.
                  </p>
                </div>
              )}

              {/* Chart view - Horizontal bar chart by category */}
              {findingsViewMode === 'chart' && findings.all && findings.all.length > 0 && (() => {
                // Group findings by category (finding_type) - Business-friendly labels
                const categoryLabels = {
                  process: 'Business Process',
                  pain_point: 'Current Challenges',
                  integration: 'System Integration',
                  compliance: 'Compliance & Audit',
                  performance: 'Efficiency & Performance',
                  workaround: 'Manual Workarounds',
                  requirement: 'Business Requirements',
                  other: 'General Observations'
                };

                const groupedByCategory = {};
                findings.all.forEach(f => {
                  const cat = f.finding_type || 'other';
                  if (!groupedByCategory[cat]) {
                    groupedByCategory[cat] = { high: [], medium: [], low: [] };
                  }
                  const risk = f.sap_risk_level || 'medium';
                  groupedByCategory[cat][risk].push(f);
                });

                // Calculate max total for scaling
                const maxTotal = Math.max(
                  ...Object.values(groupedByCategory).map(g => g.high.length + g.medium.length + g.low.length),
                  1
                );

                return (
                  <div className="space-y-3">
                    {Object.entries(groupedByCategory)
                      .sort((a, b) => {
                        const totalA = a[1].high.length + a[1].medium.length + a[1].low.length;
                        const totalB = b[1].high.length + b[1].medium.length + b[1].low.length;
                        return totalB - totalA;
                      })
                      .map(([category, counts]) => {
                        const total = counts.high.length + counts.medium.length + counts.low.length;
                        const highPct = (counts.high.length / maxTotal) * 100;
                        const mediumPct = (counts.medium.length / maxTotal) * 100;
                        const lowPct = (counts.low.length / maxTotal) * 100;

                        return (
                          <div
                            key={category}
                            className="flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-gray-50"
                          >
                            {/* Category label - click to show all */}
                            <div
                              className="w-44 text-sm font-medium text-gray-700 truncate cursor-pointer hover:text-purple-600"
                              title={`${categoryLabels[category] || category} - Click to view all`}
                              onClick={() => setSelectedFindingsCategory({ category, label: categoryLabels[category] || category, findings: [...counts.high, ...counts.medium, ...counts.low] })}
                            >
                              {categoryLabels[category] || category}
                            </div>
                            {/* Stacked bar - each segment clickable */}
                            <div className="flex-1 flex items-center h-8 bg-gray-100 rounded overflow-hidden">
                              {counts.high.length > 0 && (
                                <div
                                  className="h-full bg-red-500 flex items-center justify-center text-white text-xs font-medium cursor-pointer hover:bg-red-600 transition-colors"
                                  style={{ width: `${highPct}%`, minWidth: counts.high.length > 0 ? '20px' : '0' }}
                                  title={`High Risk: ${counts.high.length} - Click to view`}
                                  onClick={() => setSelectedFindingsCategory({ category, label: `${categoryLabels[category] || category} - High Risk`, findings: counts.high })}
                                >
                                  {counts.high.length > 0 && counts.high.length}
                                </div>
                              )}
                              {counts.medium.length > 0 && (
                                <div
                                  className="h-full bg-yellow-500 flex items-center justify-center text-white text-xs font-medium cursor-pointer hover:bg-yellow-600 transition-colors"
                                  style={{ width: `${mediumPct}%`, minWidth: counts.medium.length > 0 ? '20px' : '0' }}
                                  title={`Medium Risk: ${counts.medium.length} - Click to view`}
                                  onClick={() => setSelectedFindingsCategory({ category, label: `${categoryLabels[category] || category} - Medium Risk`, findings: counts.medium })}
                                >
                                  {counts.medium.length > 0 && counts.medium.length}
                                </div>
                              )}
                              {counts.low.length > 0 && (
                                <div
                                  className="h-full bg-yellow-300 flex items-center justify-center text-yellow-800 text-xs font-medium cursor-pointer hover:bg-yellow-400 transition-colors"
                                  style={{ width: `${lowPct}%`, minWidth: counts.low.length > 0 ? '20px' : '0' }}
                                  title={`Low Risk: ${counts.low.length} - Click to view`}
                                  onClick={() => setSelectedFindingsCategory({ category, label: `${categoryLabels[category] || category} - Low Risk`, findings: counts.low })}
                                >
                                  {counts.low.length > 0 && counts.low.length}
                                </div>
                              )}
                            </div>
                            {/* Total count - click to show all */}
                            <div
                              className="w-8 text-sm text-gray-500 text-right cursor-pointer hover:text-purple-600"
                              title="Click to view all"
                              onClick={() => setSelectedFindingsCategory({ category, label: categoryLabels[category] || category, findings: [...counts.high, ...counts.medium, ...counts.low] })}
                            >
                              {total}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })()}

              {/* List view - Table style with filters */}
              {findingsViewMode === 'list' && findings.all && findings.all.length > 0 && (() => {
                const categoryLabels = {
                  process: 'Business Process',
                  pain_point: 'Current Challenges',
                  integration: 'System Integration',
                  compliance: 'Compliance & Audit',
                  performance: 'Efficiency & Performance',
                  workaround: 'Manual Workarounds',
                  requirement: 'Business Requirements',
                  other: 'General Observations'
                };

                // Get unique categories from findings
                const categories = [...new Set(findings.all.map(f => f.finding_type || 'other'))];

                return (
                  <div className="space-y-3">
                    {/* Filters */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        value={findingsFilterCategory || ''}
                        onChange={(e) => setFindingsFilterCategory(e.target.value || null)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="">All Categories</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{categoryLabels[cat] || cat}</option>
                        ))}
                      </select>
                      <select
                        value={findingsFilterRisk || ''}
                        onChange={(e) => setFindingsFilterRisk(e.target.value || null)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="">All Risk Levels</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>

                    {/* Table */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-700 w-44">Category</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-700 w-20">Risk</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-700">Finding</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {[...findings.all]
                            .sort((a, b) => {
                              const riskOrder = { high: 0, medium: 1, low: 2 };
                              return (riskOrder[a.sap_risk_level] || 1) - (riskOrder[b.sap_risk_level] || 1);
                            })
                            .filter(f => !findingsFilterCategory || (f.finding_type || 'other') === findingsFilterCategory)
                            .filter(f => !findingsFilterRisk || (f.sap_risk_level || 'medium') === findingsFilterRisk)
                            .map((finding, idx) => {
                              const risk = finding.sap_risk_level || 'medium';
                              const category = finding.finding_type || 'other';
                              const riskColors = {
                                high: 'bg-red-500 text-white',
                                medium: 'bg-yellow-500 text-white',
                                low: 'bg-yellow-300 text-yellow-800'
                              };

                              return (
                                <tr
                                  key={finding.id || idx}
                                  className="hover:bg-gray-50 cursor-pointer"
                                  onClick={() => setImplicationsFinding(finding)}
                                >
                                  <td className="px-3 py-2 text-sm text-gray-700">{categoryLabels[category] || category}</td>
                                  <td className="px-3 py-2">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${riskColors[risk]}`}>
                                      {risk.charAt(0).toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-900">
                                    <div className="font-medium">{finding.topic}</div>
                                    {finding.details && <div className="text-gray-500 text-xs mt-0.5 line-clamp-1">{finding.details}</div>}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Tiles view - Card style grouped by category */}
              {findingsViewMode === 'tiles' && findings.all && findings.all.length > 0 && (() => {
                const categoryLabels = {
                  process: 'Business Process',
                  pain_point: 'Current Challenges',
                  integration: 'System Integration',
                  compliance: 'Compliance & Audit',
                  performance: 'Efficiency & Performance',
                  workaround: 'Manual Workarounds',
                  requirement: 'Business Requirements',
                  other: 'General Observations'
                };
                const riskBorderColors = {
                  high: 'border-l-red-500',
                  medium: 'border-l-yellow-500',
                  low: 'border-l-yellow-300'
                };
                const riskBadgeColors = {
                  high: 'bg-red-500 text-white',
                  medium: 'bg-yellow-500 text-white',
                  low: 'bg-yellow-300 text-yellow-800'
                };

                // Filter by risk if selected, then group by category
                const filteredFindings = findingsFilterRisk
                  ? findings.all.filter(f => (f.sap_risk_level || 'medium') === findingsFilterRisk)
                  : findings.all;

                const grouped = {};
                filteredFindings.forEach(f => {
                  const cat = f.finding_type || 'other';
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(f);
                });

                return (
                  <div className="space-y-6">
                    {Object.entries(grouped)
                      .sort((a, b) => b[1].length - a[1].length)
                      .map(([category, catFindings]) => (
                        <div key={category}>
                          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            {categoryLabels[category] || category}
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {catFindings.length}
                            </span>
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {[...catFindings]
                              .sort((a, b) => {
                                const riskOrder = { high: 0, medium: 1, low: 2 };
                                return (riskOrder[a.sap_risk_level] || 1) - (riskOrder[b.sap_risk_level] || 1);
                              })
                              .map((finding, idx) => {
                              const risk = finding.sap_risk_level || 'medium';
                              return (
                                <div
                                  key={finding.id || idx}
                                  className={`p-4 bg-white border border-gray-200 rounded-lg border-l-4 ${riskBorderColors[risk]} cursor-pointer hover:shadow-md transition-shadow`}
                                  onClick={() => setImplicationsFinding(finding)}
                                >
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${riskBadgeColors[risk]}`}>
                                      {risk.toUpperCase()}
                                    </span>
                                  </div>
                                  <h4 className="font-medium text-gray-900 mb-1">{finding.topic}</h4>
                                  {finding.details && (
                                    <p className="text-sm text-gray-600 line-clamp-2">{finding.details}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-3">
              {/* Transcript MD File - Always shown at top */}
              <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <div className="p-2 rounded-lg bg-indigo-100">
                  <FileText className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-indigo-900">Session Transcript</p>
                  <p className="text-xs text-indigo-600">
                    Consolidated transcript of all audio recordings
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleViewTranscript}
                    disabled={transcriptLoading}
                    className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded"
                    title="View transcript"
                  >
                    {transcriptLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <a
                    href={getTranscriptDownloadUrl(sessionId)}
                    download
                    className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded"
                    title="Download transcript MD"
                  >
                    <FileDown className="w-4 h-4" />
                  </a>
                  <button
                    onClick={handleRegenerateTranscript}
                    className="p-1.5 text-amber-600 hover:bg-amber-100 rounded"
                    title="Regenerate transcript from recordings"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Uploaded Documents */}
              {documents.length > 0 ? (
                documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className={`p-2 rounded-lg ${
                      doc.analysis_status === 'completed' ? 'bg-green-100' :
                      doc.analysis_status === 'failed' ? 'bg-red-100' :
                      doc.analysis_status === 'processing' ? 'bg-blue-100' :
                      'bg-gray-100'
                    }`}>
                      <FileText className={`w-5 h-5 ${
                        doc.analysis_status === 'completed' ? 'text-green-600' :
                        doc.analysis_status === 'failed' ? 'text-red-600' :
                        doc.analysis_status === 'processing' ? 'text-blue-600' :
                        'text-gray-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.original_name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
                        <span>•</span>
                        <span className={`font-medium ${
                          doc.analysis_status === 'completed' ? 'text-green-600' :
                          doc.analysis_status === 'failed' ? 'text-red-600' :
                          doc.analysis_status === 'processing' ? 'text-blue-600' :
                          'text-gray-500'
                        }`}>
                          {doc.analysis_status === 'completed' ? 'Analyzed' :
                           doc.analysis_status === 'failed' ? 'Failed' :
                           doc.analysis_status === 'processing' ? 'Processing...' :
                           'Pending'}
                        </span>
                        {doc.analysis_status === 'completed' && (
                          <>
                            <span>•</span>
                            <span className="text-green-600">{doc.obtained_count} obtained</span>
                            <span>•</span>
                            <span className="text-purple-600">{doc.findings_count} findings</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Delete document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-gray-500 border border-dashed border-gray-200 rounded-lg">
                  <FileUp className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No additional documents uploaded</p>
                  <p className="text-xs mt-1">
                    Upload PDF, Word, or text files to extract information.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transcript Modal */}
      {showTranscript && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Session Transcript</h3>
              <div className="flex items-center gap-2">
                <a
                  href={getTranscriptDownloadUrl(sessionId)}
                  download
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  <FileDown className="w-4 h-4" />
                  Download MD
                </a>
                <button
                  onClick={handleRegenerateTranscript}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100"
                  title="Regenerate transcript from saved recordings"
                >
                  <RotateCcw className="w-4 h-4" />
                  Regenerate
                </button>
                <button
                  onClick={() => setShowTranscript(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded-lg">
                {transcriptContent || 'No transcript available yet.'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Best Practice Modal */}
      {bestPracticeItem && (
        <BestPracticeModal item={bestPracticeItem} onClose={() => setBestPracticeItem(null)} />
      )}

      {/* Implications Modal */}
      {implicationsFinding && (
        <ImplicationsModal finding={implicationsFinding} onClose={() => setImplicationsFinding(null)} />
      )}

      {/* Category Findings Modal */}
      {selectedFindingsCategory && (
        <CategoryFindingsModal
          category={selectedFindingsCategory}
          onClose={() => setSelectedFindingsCategory(null)}
          onShowImplications={(finding) => {
            setSelectedFindingsCategory(null);
            setImplicationsFinding(finding);
          }}
        />
      )}
    </div>
  );
}

// Sub-components
function MissingItemCard({ item, importance, onShowBestPractice }) {
  const importanceColors = {
    critical: 'bg-red-50 border-red-200',
    important: 'bg-orange-50 border-orange-200',
    'nice-to-have': 'bg-gray-50 border-gray-200'
  };

  const imp = item.importance || importance || 'important';

  return (
    <div className={`p-3 rounded-lg border ${importanceColors[imp] || importanceColors.important}`}>
      <div className="flex items-start gap-2">
        <Target className={`w-4 h-4 mt-0.5 ${
          imp === 'critical' ? 'text-red-500' :
          imp === 'important' ? 'text-orange-500' : 'text-gray-400'
        }`} />
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">{item.item_text}</p>
            {item.best_practice && (
              <button
                onClick={() => onShowBestPractice(item)}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors shrink-0 bg-amber-100 text-amber-700 hover:bg-amber-200"
                title="View best practice"
              >
                <Lightbulb className="w-3 h-3" />
                Best Practice
              </button>
            )}
          </div>
          {item.category && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-white rounded text-xs text-gray-500">
              {item.category}
            </span>
          )}
          {item.suggested_question && (
            <p className="text-xs text-gray-500 mt-2 italic">
              Ask: "{item.suggested_question}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ObtainedItemCard({ item, sessionId, onUpdate, onShowBestPractice }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.obtained_text || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      await updateChecklistItem(sessionId, item.id, { obtained_text: editText });
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to update item:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditText(item.obtained_text || '');
    setIsEditing(false);
  };

  return (
    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-start gap-2">
        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">{item.item_text}</p>
            {item.best_practice && (
              <button
                onClick={() => onShowBestPractice(item)}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors shrink-0 bg-amber-100 text-amber-700 hover:bg-amber-200"
                title="View best practice"
              >
                <Lightbulb className="w-3 h-3" />
                Best Practice
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="mt-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                rows={3}
                placeholder="Enter the obtained information..."
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !editText.trim()}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {item.obtained_text && (
                <div className="relative group mt-1">
                  <p className="text-sm text-gray-700 bg-white rounded p-2 border border-green-100 pr-8">
                    {item.obtained_text}
                  </p>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit obtained text"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {!item.obtained_text && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="mt-1 text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  Add details
                </button>
              )}
            </>
          )}

          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
            {item.category && (
              <span className="px-2 py-0.5 bg-white rounded">
                {item.category}
              </span>
            )}
            {item.obtained_source && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                Source: {item.obtained_source}
              </span>
            )}
            {item.obtained_confidence && (
              <span className={`px-2 py-0.5 rounded ${
                item.obtained_confidence === 'high' ? 'bg-green-100 text-green-700' :
                item.obtained_confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {item.obtained_confidence} confidence
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding, onShowImplications }) {
  const [expanded, setExpanded] = useState(false);

  const riskColors = {
    high: 'border-red-300 bg-red-50',
    medium: 'border-yellow-300 bg-yellow-50',
    low: 'border-blue-300 bg-blue-50'
  };

  const riskBadgeColors = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700'
  };

  const typeIcons = {
    process: <Zap className="w-4 h-4" />,
    pain_point: <AlertCircle className="w-4 h-4" />,
    integration: <Shield className="w-4 h-4" />,
    compliance: <Shield className="w-4 h-4" />,
    performance: <Zap className="w-4 h-4" />,
    workaround: <AlertTriangle className="w-4 h-4" />,
    requirement: <Target className="w-4 h-4" />,
    other: <Lightbulb className="w-4 h-4" />
  };

  const risk = finding.sap_risk_level || 'medium';

  return (
    <div className={`rounded-lg border-2 ${riskColors[risk]} overflow-hidden`}>
      {/* Header - always visible */}
      <div
        className="p-4 cursor-pointer hover:bg-white/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-purple-600">
            {typeIcons[finding.finding_type] || typeIcons.other}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-gray-900">{finding.topic}</h4>
              <span className={`px-2 py-0.5 text-xs rounded-full ${riskBadgeColors[risk]}`}>
                {risk} risk
              </span>
              <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full capitalize">
                {finding.finding_type?.replace('_', ' ') || 'general'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowImplications(finding);
                }}
                className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 transition-colors flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3" />
                Implications
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{finding.details}</p>
          </div>
          <button className="p-1 hover:bg-white rounded">
            {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-white/50">
          {/* Source Quote */}
          {finding.source_quote && (
            <div className="bg-white/70 rounded p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">From Recording:</p>
              <p className="text-sm text-gray-700 italic">"{finding.source_quote}"</p>
            </div>
          )}

          {/* SAP Analysis */}
          {finding.sap_analysis && (
            <div className="bg-white/70 rounded p-3">
              <p className="text-xs font-medium text-purple-700 mb-1 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                SAP Analysis
              </p>
              <p className="text-sm text-gray-700">{finding.sap_analysis}</p>
            </div>
          )}

          {/* SAP Recommendation */}
          {finding.sap_recommendation && (
            <div className="bg-white/70 rounded p-3 border-l-4 border-green-400">
              <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                SAP Recommendation
              </p>
              <p className="text-sm text-gray-700">{finding.sap_recommendation}</p>
            </div>
          )}

          {/* SAP Best Practice / Solution */}
          {finding.sap_best_practice && (
            <div className="bg-white/70 rounded p-3 border-l-4 border-blue-400">
              <p className="text-xs font-medium text-blue-700 mb-1 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                SAP Best Practice / Solution
              </p>
              <p className="text-sm text-gray-700">{finding.sap_best_practice}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Best Practice Modal Component
function BestPracticeModal({ item, onClose }) {
  // Parse best_practice JSON if it's a string
  let bestPractice = null;
  if (item.best_practice) {
    try {
      bestPractice = typeof item.best_practice === 'string'
        ? JSON.parse(item.best_practice)
        : item.best_practice;
    } catch {
      // If parsing fails, treat as legacy string format
      bestPractice = { sap_recommendation: item.best_practice };
    }
  }

  if (!bestPractice) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Lightbulb className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Industry Best Practice</h3>
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.item_text}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* SAP Recommendation */}
          {bestPractice.sap_recommendation && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-blue-900">SAP Recommendation</h4>
              </div>
              <p className="text-gray-700">{bestPractice.sap_recommendation}</p>
            </div>
          )}

          {/* Why Important */}
          {bestPractice.why_important && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-green-600" />
                <h4 className="font-semibold text-green-900">Why This Matters</h4>
              </div>
              <p className="text-gray-700">{bestPractice.why_important}</p>
            </div>
          )}

          {/* Common Pitfalls */}
          {bestPractice.common_pitfalls && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h4 className="font-semibold text-red-900">Common Pitfalls to Avoid</h4>
              </div>
              <p className="text-gray-700">{bestPractice.common_pitfalls}</p>
            </div>
          )}

          {/* Success Factors */}
          {bestPractice.success_factors && (
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-purple-900">Key Success Factors</h4>
              </div>
              <p className="text-gray-700">{bestPractice.success_factors}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Implications Modal Component
function ImplicationsModal({ finding, onClose }) {
  const risk = finding.sap_risk_level || 'medium';

  const riskColors = {
    high: 'from-red-50 to-red-100',
    medium: 'from-yellow-50 to-orange-50',
    low: 'from-blue-50 to-cyan-50'
  };

  const riskIconColors = {
    high: 'bg-red-100 text-red-600',
    medium: 'bg-yellow-100 text-yellow-600',
    low: 'bg-blue-100 text-blue-600'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-start justify-between p-5 border-b bg-gradient-to-r ${riskColors[risk]}`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${riskIconColors[risk]}`}>
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Implications Analysis</h3>
              <p className="text-sm text-gray-600 mt-1">{finding.topic}</p>
              <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full font-medium ${
                risk === 'high' ? 'bg-red-100 text-red-700' :
                risk === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {risk.charAt(0).toUpperCase() + risk.slice(1)} Risk
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Finding Details */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-5 h-5 text-purple-600" />
              <h4 className="font-semibold text-gray-900">Finding Details</h4>
            </div>
            <p className="text-gray-700">{finding.details}</p>
          </div>

          {/* SAP Analysis - Implications */}
          {finding.sap_analysis && (
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-purple-900">SAP Implementation Implications</h4>
              </div>
              <p className="text-gray-700">{finding.sap_analysis}</p>
            </div>
          )}

          {/* Business Impact */}
          <div className={`rounded-lg p-4 border ${
            risk === 'high' ? 'bg-red-50 border-red-200' :
            risk === 'medium' ? 'bg-yellow-50 border-yellow-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Shield className={`w-5 h-5 ${
                risk === 'high' ? 'text-red-600' :
                risk === 'medium' ? 'text-yellow-600' :
                'text-blue-600'
              }`} />
              <h4 className={`font-semibold ${
                risk === 'high' ? 'text-red-900' :
                risk === 'medium' ? 'text-yellow-900' :
                'text-blue-900'
              }`}>Business Impact</h4>
            </div>
            <ul className="space-y-2 text-gray-700">
              {risk === 'high' && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">•</span>
                    <span>Critical gap that may cause project delays or failures</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">•</span>
                    <span>Requires immediate attention and mitigation strategy</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">•</span>
                    <span>May require significant process redesign or additional scope</span>
                  </li>
                </>
              )}
              {risk === 'medium' && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-500 mt-1">•</span>
                    <span>Moderate impact on implementation timeline or scope</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-500 mt-1">•</span>
                    <span>Should be addressed during design phase</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-500 mt-1">•</span>
                    <span>May require additional configuration or customization</span>
                  </li>
                </>
              )}
              {risk === 'low' && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span>Minor impact, can be addressed during implementation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span>Good to document for future reference</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span>Standard SAP functionality may address this</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* SAP Recommendation */}
          {finding.sap_recommendation && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h4 className="font-semibold text-green-900">Recommended Action</h4>
              </div>
              <p className="text-gray-700">{finding.sap_recommendation}</p>
            </div>
          )}

          {/* SAP Best Practice */}
          {finding.sap_best_practice && (
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-indigo-600" />
                <h4 className="font-semibold text-indigo-900">SAP Best Practice</h4>
              </div>
              <p className="text-gray-700">{finding.sap_best_practice}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Category Findings Modal - shows findings list when a bar is clicked
function CategoryFindingsModal({ category, onClose, onShowImplications }) {
  const { label, findings } = category;

  // Sort findings by risk level (high first)
  const sortedFindings = [...findings].sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return (riskOrder[a.sap_risk_level] || 1) - (riskOrder[b.sap_risk_level] || 1);
  });

  const highCount = findings.filter(f => f.sap_risk_level === 'high').length;
  const mediumCount = findings.filter(f => f.sap_risk_level === 'medium').length;
  const lowCount = findings.filter(f => f.sap_risk_level === 'low').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-amber-50 to-orange-50">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{label} Findings</h3>
            <div className="flex items-center gap-4 mt-1 text-sm">
              <span className="text-gray-600">Total: {findings.length}</span>
              {highCount > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  {highCount} High
                </span>
              )}
              {mediumCount > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                  {mediumCount} Medium
                </span>
              )}
              {lowCount > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <span className="w-2 h-2 bg-yellow-300 rounded-full"></span>
                  {lowCount} Low
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {sortedFindings.map((finding, index) => {
            const riskColors = {
              high: 'border-l-red-500 bg-red-50',
              medium: 'border-l-yellow-500 bg-yellow-50',
              low: 'border-l-yellow-300 bg-yellow-50/50'
            };
            const riskBadgeColors = {
              high: 'bg-red-100 text-red-700',
              medium: 'bg-yellow-100 text-yellow-700',
              low: 'bg-yellow-100 text-yellow-600'
            };
            const risk = finding.sap_risk_level || 'medium';

            return (
              <div
                key={finding.id || index}
                className={`p-4 rounded-lg border-l-4 ${riskColors[risk]} border border-gray-200`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900">{finding.topic}</h4>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${riskBadgeColors[risk]}`}>
                        {risk.toUpperCase()}
                      </span>
                    </div>
                    {finding.details && (
                      <p className="text-sm text-gray-600 line-clamp-2">{finding.details}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onShowImplications(finding)}
                    className="px-3 py-1.5 text-xs bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors whitespace-nowrap"
                  >
                    View Details
                  </button>
                </div>
                {finding.sap_recommendation && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-green-700">Recommendation:</span> {finding.sap_recommendation}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChecklistModeView;
