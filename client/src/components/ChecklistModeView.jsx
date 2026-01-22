import { useState, useEffect, useCallback, useRef } from 'react';
import { useChunkedRecording } from '../hooks/useChunkedRecording';
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
  Settings,
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
  Eye
} from 'lucide-react';

// Chunk duration options in seconds
const CHUNK_DURATION_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 2 * 60, label: '2 minutes' },
  { value: 3 * 60, label: '3 minutes' },
  { value: 5 * 60, label: '5 minutes' },
  { value: 10 * 60, label: '10 minutes' },
  { value: 15 * 60, label: '15 minutes' }
];

function ChecklistModeView({ workshopId, sessionId, session }) {
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
  const [showSettings, setShowSettings] = useState(false);
  const [chunkDuration, setChunkDuration] = useState(60); // Default 1 minute
  const settingsRef = useRef(null);
  const documentInputRef = useRef(null);
  const [documentUploadStatus, setDocumentUploadStatus] = useState(null); // null, 'uploading', 'analyzing', 'complete', 'error'
  const [documentUploadMessage, setDocumentUploadMessage] = useState('');
  const [reanalyzeStatus, setReanalyzeStatus] = useState(null); // null, 'analyzing', 'complete', 'error'
  const [reanalyzeResult, setReanalyzeResult] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptContent, setTranscriptContent] = useState('');
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

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

    try {
      // Step 1: Upload audio
      const formData = new FormData();
      formData.append('audio', blob, `session-chunk-${chunkIndex}.webm`);
      formData.append('duration_seconds', Math.round(duration));
      formData.append('chunk_index', chunkIndex);

      const uploadResponse = await uploadSessionAudio(sessionId, formData);
      const audioId = uploadResponse.data.id;

      // Step 2: Transcribe and analyze
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        newStatus[chunkIndex] = { status: 'analyzing', step: 2, message: 'Transcribing & analyzing...' };
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
          obtainedCount: analysisResponse.data.obtainedCount || 0
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
          step: 0,
          message: error.response?.data?.error || error.message
        };
        return newStatus;
      });
    }
  }, [sessionId]);

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
    chunkDurationSeconds: chunkDuration
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

  return (
    <div className="space-y-4">
      {/* Header with progress */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{session?.name || 'Session'}</h2>
            <p className="text-sm text-gray-500">Direct Checklist Mode</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Settings dropdown */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                disabled={isRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Recording Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              {showSettings && !isRecording && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Recording Settings</h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Chunk Duration
                    </label>
                    <select
                      value={chunkDuration}
                      onChange={(e) => setChunkDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                    >
                      {CHUNK_DURATION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Audio is transcribed and analyzed after each chunk completes.
                    </p>
                  </div>
                </div>
              )}
            </div>

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
            <input
              type="file"
              ref={documentInputRef}
              onChange={handleDocumentUpload}
              accept=".pdf,.doc,.docx,.txt,.csv"
              className="hidden"
            />
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
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
              style={{ width: `${stats.completionPercent}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-700 min-w-[100px] text-right">
            {stats.obtained}/{stats.total} ({stats.completionPercent}%)
          </span>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-3 text-xs">
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

      {/* Recording status */}
      {isRecording && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="font-medium text-red-800">Recording in Progress</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-red-700">
              <Clock className="w-4 h-4" />
              <span>Total: {formatTime(recordingTime)}</span>
              <span className="text-red-400">|</span>
              <span>Chunk: {formatTime(currentChunkTime)} / {formatTime(chunkDurationSeconds)}</span>
            </div>
          </div>

          {/* Audio level indicator */}
          <div className="h-2 bg-red-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-75"
              style={{ width: `${audioLevel}%` }}
            />
          </div>

          {/* Chunk processing status - single line */}
          <div className="mt-3 flex items-center gap-3 text-xs">
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
                  <span className="text-red-600" title={chunkProcessingStatus.filter(s => s.status === 'error').map(s => s.message).join(', ')}>
                    {chunkProcessingStatus.filter(s => s.status === 'error').length} failed
                  </span>
                )}
              </>
            ) : (
              <span className="text-gray-500">Recording will be analyzed in chunks...</span>
            )}
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
                      <MissingItemCard key={item.id} item={item} />
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
                      <MissingItemCard key={item.id} item={item} />
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
                      <MissingItemCard key={item.id} item={item} importance="nice-to-have" />
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
                      <ObtainedItemCard key={item.id} item={item} sessionId={sessionId} onUpdate={loadChecklist} />
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
                      <ObtainedItemCard key={item.id} item={item} sessionId={sessionId} onUpdate={loadChecklist} />
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
                      <ObtainedItemCard key={item.id} item={item} sessionId={sessionId} onUpdate={loadChecklist} />
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
              {/* Risk level summary */}
              {findings.stats?.total > 0 && (
                <div className="flex gap-3 mb-4">
                  {findings.stats.highRisk > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                      <AlertCircle className="w-4 h-4" />
                      {findings.stats.highRisk} High Risk
                    </div>
                  )}
                  {findings.stats.mediumRisk > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                      <AlertTriangle className="w-4 h-4" />
                      {findings.stats.mediumRisk} Medium Risk
                    </div>
                  )}
                  {findings.stats.lowRisk > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      <Info className="w-4 h-4" />
                      {findings.stats.lowRisk} Low Risk
                    </div>
                  )}
                </div>
              )}

              {/* Findings list */}
              {findings.all?.map(finding => (
                <FindingCard key={finding.id} finding={finding} />
              ))}

              {(!findings.all || findings.all.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <Lightbulb className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="font-medium">No additional findings yet</p>
                  <p className="text-sm mt-1">
                    When you discuss topics beyond the checklist, the system will capture them here with SAP best practice analysis.
                  </p>
                </div>
              )}
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
    </div>
  );
}

// Sub-components
function MissingItemCard({ item, importance }) {
  const [showBestPractice, setShowBestPractice] = useState(false);

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
                onClick={() => setShowBestPractice(!showBestPractice)}
                className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors shrink-0 ${
                  showBestPractice
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
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
          {showBestPractice && item.best_practice && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 mb-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                Industry Best Practice
              </div>
              <p className="text-sm text-amber-900">{item.best_practice}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ObtainedItemCard({ item, sessionId, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.obtained_text || '');
  const [saving, setSaving] = useState(false);
  const [showBestPractice, setShowBestPractice] = useState(false);

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
                onClick={() => setShowBestPractice(!showBestPractice)}
                className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors shrink-0 ${
                  showBestPractice
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
                title="View best practice"
              >
                <Lightbulb className="w-3 h-3" />
                Best Practice
              </button>
            )}
          </div>

          {showBestPractice && item.best_practice && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 mb-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                Industry Best Practice
              </div>
              <p className="text-sm text-amber-900">{item.best_practice}</p>
            </div>
          )}

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

function FindingCard({ finding }) {
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

export default ChecklistModeView;
