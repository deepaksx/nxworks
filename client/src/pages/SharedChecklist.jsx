import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useChunkedRecording } from '../hooks/useChunkedRecording';
import {
  getShareInfo,
  shareLogin,
  shareHeartbeat,
  shareRelease,
  getShareChecklist,
  getShareChecklistStats,
  uploadShareAudio,
  analyzeShareAudio,
  getShareFindings,
  uploadShareDocument,
  analyzeShareDocument
} from '../services/shareApi';
import {
  Mic,
  Square,
  CheckCircle,
  AlertTriangle,
  Target,
  Loader2,
  RefreshCw,
  Clock,
  Lock,
  LogIn,
  User,
  Key,
  Building2,
  Settings,
  Lightbulb,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileUp,
  X,
  Shield
} from 'lucide-react';

// Chunk duration options
const CHUNK_DURATION_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 2 * 60, label: '2 minutes' },
  { value: 3 * 60, label: '3 minutes' },
  { value: 5 * 60, label: '5 minutes' }
];

function SharedChecklist() {
  const { token } = useParams();

  // Auth state
  const [sessionInfo, setSessionInfo] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Page state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Checklist state
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
  const [activeTab, setActiveTab] = useState('missing');
  const [chunkProcessingStatus, setChunkProcessingStatus] = useState([]);
  const [chunkDuration, setChunkDuration] = useState(60);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);
  const documentInputRef = useRef(null);
  const [documentUploadStatus, setDocumentUploadStatus] = useState(null);
  const [documentUploadMessage, setDocumentUploadMessage] = useState('');
  const [bestPracticeItem, setBestPracticeItem] = useState(null); // Item to show best practice modal for
  const [findingsRiskTab, setFindingsRiskTab] = useState('all'); // 'all', 'high', 'medium', 'low'
  const [implicationsFinding, setImplicationsFinding] = useState(null); // Finding to show implications modal for
  const [retryingChunks, setRetryingChunks] = useState(false); // Retrying failed chunks

  // Heartbeat interval ref
  const heartbeatRef = useRef(null);

  // Load session info on mount
  useEffect(() => {
    loadSessionInfo();
  }, [token]);

  // Setup heartbeat when authenticated
  useEffect(() => {
    if (authToken) {
      // Send heartbeat every 30 seconds
      heartbeatRef.current = setInterval(() => {
        shareHeartbeat(token, authToken).catch(console.error);
      }, 30000);

      // Cleanup on unmount
      return () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
        }
        // Release lock on unmount
        shareRelease(token, authToken).catch(console.error);
      };
    }
  }, [authToken, token]);

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

  const loadSessionInfo = async () => {
    try {
      setLoading(true);
      const response = await getShareInfo(token);
      setSessionInfo(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired share link');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const response = await shareLogin(token, username, password);
      setAuthToken(response.data.token);
      // Load checklist after login
      await loadChecklist(response.data.token);
    } catch (err) {
      if (err.response?.status === 423) {
        setLoginError(`Session is currently in use by ${err.response.data.lockedBy}`);
      } else {
        setLoginError(err.response?.data?.error || 'Login failed');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const loadChecklist = async (tokenToUse = authToken) => {
    try {
      const [checklistRes, statsRes, findingsRes] = await Promise.all([
        getShareChecklist(token, tokenToUse),
        getShareChecklistStats(token, tokenToUse),
        getShareFindings(token, tokenToUse).catch(() => ({ data: { all: [], stats: { total: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 } } }))
      ]);
      setChecklist(checklistRes.data);
      setStats(statsRes.data);
      setFindings(findingsRes.data);
    } catch (err) {
      console.error('Error loading checklist:', err);
    }
  };

  // Document upload handler
  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';

    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.csv'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowedExtensions.includes(ext)) {
      setDocumentUploadStatus('error');
      setDocumentUploadMessage('Only PDF, Word documents, and text files are allowed');
      setTimeout(() => setDocumentUploadStatus(null), 5000);
      return;
    }

    try {
      setDocumentUploadStatus('uploading');
      setDocumentUploadMessage(`Uploading ${file.name}...`);

      const formData = new FormData();
      formData.append('document', file);

      const uploadResponse = await uploadShareDocument(token, authToken, formData);
      const documentId = uploadResponse.data.id;

      setDocumentUploadStatus('analyzing');
      setDocumentUploadMessage('Extracting text and analyzing against checklist...');

      const analysisResponse = await analyzeShareDocument(token, authToken, documentId);

      setDocumentUploadStatus('complete');
      setDocumentUploadMessage(
        `Done! ${analysisResponse.data.obtainedCount || 0} items obtained, ${analysisResponse.data.findingsCount || 0} findings captured`
      );

      await loadChecklist();
      setTimeout(() => setDocumentUploadStatus(null), 5000);

    } catch (error) {
      console.error('Error uploading/analyzing document:', error);
      setDocumentUploadStatus('error');
      setDocumentUploadMessage(error.response?.data?.error || error.message || 'Failed to process document');
      setTimeout(() => setDocumentUploadStatus(null), 5000);
    }
  };

  // Chunked recording callback
  const handleChunkReady = useCallback(async (blob, chunkIndex, duration) => {
    console.log(`Chunk ${chunkIndex} ready (${Math.round(duration)}s)`);

    setChunkProcessingStatus(prev => {
      const newStatus = [...prev];
      newStatus[chunkIndex] = { status: 'uploading', step: 1, message: 'Uploading...' };
      return newStatus;
    });

    let audioId = null;

    try {
      // Upload audio
      const formData = new FormData();
      formData.append('audio', blob, `session-chunk-${chunkIndex}.webm`);
      formData.append('duration_seconds', Math.round(duration));
      formData.append('chunk_index', chunkIndex);

      const uploadResponse = await uploadShareAudio(token, authToken, formData);
      audioId = uploadResponse.data.id;

      // Transcribe and analyze
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        newStatus[chunkIndex] = { status: 'analyzing', step: 2, message: 'Transcribing & analyzing...', audioId };
        return newStatus;
      });

      const analysisResponse = await analyzeShareAudio(token, authToken, audioId);

      // Complete
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

      // Reload checklist
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
  }, [token, authToken]);

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

        const analysisResponse = await analyzeShareAudio(token, authToken, chunk.audioId);

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
  }, [chunkProcessingStatus, token, authToken]);

  const handleAllChunksComplete = useCallback(async () => {
    console.log('All chunks complete, reloading checklist...');
    await loadChecklist();
  }, [authToken]);

  const {
    isRecording,
    recordingTime,
    audioLevel,
    currentChunkTime,
    startRecording,
    stopRecording,
    formatTime,
    chunkDurationSeconds
  } = useChunkedRecording({
    onChunkReady: handleChunkReady,
    onAllChunksComplete: handleAllChunksComplete,
    chunkDurationSeconds: chunkDuration
  });

  // Group items by importance
  const groupByImportance = (items) => {
    return {
      critical: items.filter(i => i.importance === 'critical'),
      important: items.filter(i => i.importance === 'important'),
      niceToHave: items.filter(i => i.importance === 'nice-to-have')
    };
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Not Found</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // Login form (not authenticated)
  if (!authToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{sessionInfo?.sessionName}</h1>
            <p className="text-sm text-gray-500">{sessionInfo?.workshopName}</p>
            {sessionInfo?.clientName && (
              <p className="text-xs text-gray-400 mt-1">{sessionInfo.clientName}</p>
            )}
          </div>

          {/* Locked warning */}
          {sessionInfo?.isLocked && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 text-yellow-800">
                <Lock className="w-5 h-5" />
                <span className="font-medium">Session in use</span>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                Currently being used by {sessionInfo.lockedBy}. You can try again later or wait for them to finish.
              </p>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
            >
              {loginLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              <span>{loginLoading ? 'Signing in...' : 'Sign In'}</span>
            </button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            Contact your workshop coordinator if you don't have credentials.
          </p>
        </div>
      </div>
    );
  }

  // Authenticated - show checklist
  const missingGrouped = groupByImportance(checklist.missing);
  const obtainedGrouped = groupByImportance(checklist.obtained);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{sessionInfo?.sessionName}</h1>
            <p className="text-sm text-purple-200">{sessionInfo?.workshopName}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-purple-200">
            <User className="w-4 h-4" />
            <span>{username}</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Progress card */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-gray-500">Checklist Progress</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Settings dropdown */}
              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  disabled={isRecording}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                  title="Recording Settings"
                >
                  <Settings className="w-5 h-5" />
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
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                      >
                        {CHUNK_DURATION_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

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
                  Record
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

            {/* Audio level */}
            <div className="h-2 bg-red-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-75"
                style={{ width: `${audioLevel}%` }}
              />
            </div>

            {/* Chunk status */}
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
                        Retry Failed
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
              {(documentUploadStatus === 'uploading' || documentUploadStatus === 'analyzing') && (
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
                  ? 'border-b-2 border-amber-500 text-amber-700 bg-amber-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Lightbulb className="w-4 h-4 inline mr-2" />
              Findings ({findings.stats?.total || 0})
            </button>
          </div>

          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {activeTab === 'missing' && (
              <div className="space-y-6">
                {missingGrouped.critical.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Critical ({missingGrouped.critical.length})
                    </h4>
                    <div className="space-y-2">
                      {missingGrouped.critical.map(item => (
                        <ItemCard key={item.id} item={item} type="missing" importance="critical" onShowBestPractice={setBestPracticeItem} />
                      ))}
                    </div>
                  </div>
                )}

                {missingGrouped.important.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-orange-700 uppercase mb-2 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Important ({missingGrouped.important.length})
                    </h4>
                    <div className="space-y-2">
                      {missingGrouped.important.map(item => (
                        <ItemCard key={item.id} item={item} type="missing" importance="important" onShowBestPractice={setBestPracticeItem} />
                      ))}
                    </div>
                  </div>
                )}

                {missingGrouped.niceToHave.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">
                      Nice to Have ({missingGrouped.niceToHave.length})
                    </h4>
                    <div className="space-y-2">
                      {missingGrouped.niceToHave.map(item => (
                        <ItemCard key={item.id} item={item} type="missing" importance="nice-to-have" onShowBestPractice={setBestPracticeItem} />
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
                {obtainedGrouped.critical.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Critical ({obtainedGrouped.critical.length})
                    </h4>
                    <div className="space-y-2">
                      {obtainedGrouped.critical.map(item => (
                        <ItemCard key={item.id} item={item} type="obtained" onShowBestPractice={setBestPracticeItem} />
                      ))}
                    </div>
                  </div>
                )}

                {obtainedGrouped.important.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-green-600 uppercase mb-2">
                      Important ({obtainedGrouped.important.length})
                    </h4>
                    <div className="space-y-2">
                      {obtainedGrouped.important.map(item => (
                        <ItemCard key={item.id} item={item} type="obtained" onShowBestPractice={setBestPracticeItem} />
                      ))}
                    </div>
                  </div>
                )}

                {obtainedGrouped.niceToHave.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">
                      Nice to Have ({obtainedGrouped.niceToHave.length})
                    </h4>
                    <div className="space-y-2">
                      {obtainedGrouped.niceToHave.map(item => (
                        <ItemCard key={item.id} item={item} type="obtained" onShowBestPractice={setBestPracticeItem} />
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
                {/* Risk level sub-tabs */}
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setFindingsRiskTab('all')}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      findingsRiskTab === 'all'
                        ? 'border-b-2 border-purple-500 text-purple-700'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    All ({findings.stats?.total || 0})
                  </button>
                  <button
                    onClick={() => setFindingsRiskTab('high')}
                    className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1 ${
                      findingsRiskTab === 'high'
                        ? 'border-b-2 border-red-500 text-red-700'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    High ({findings.stats?.highRisk || 0})
                  </button>
                  <button
                    onClick={() => setFindingsRiskTab('medium')}
                    className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1 ${
                      findingsRiskTab === 'medium'
                        ? 'border-b-2 border-yellow-500 text-yellow-700'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Medium ({findings.stats?.mediumRisk || 0})
                  </button>
                  <button
                    onClick={() => setFindingsRiskTab('low')}
                    className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1 ${
                      findingsRiskTab === 'low'
                        ? 'border-b-2 border-blue-500 text-blue-700'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Low ({findings.stats?.lowRisk || 0})
                  </button>
                </div>

                {/* Filtered findings list */}
                {(() => {
                  const filteredFindings = findingsRiskTab === 'all'
                    ? findings.all
                    : findings.all?.filter(f => f.sap_risk_level === findingsRiskTab);

                  if (!filteredFindings || filteredFindings.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        <Lightbulb className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                        <p>{findingsRiskTab === 'all' ? 'No additional findings yet.' : `No ${findingsRiskTab} risk findings.`}</p>
                        <p className="text-xs mt-1">Findings are captured when discussing topics outside the checklist.</p>
                      </div>
                    );
                  }

                  return filteredFindings.map(finding => (
                    <FindingCard key={finding.id} finding={finding} onShowImplications={setImplicationsFinding} />
                  ));
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Best Practice Modal */}
        {bestPracticeItem && (
          <BestPracticeModal item={bestPracticeItem} onClose={() => setBestPracticeItem(null)} />
        )}

        {/* Implications Modal */}
        {implicationsFinding && (
          <ImplicationsModal finding={implicationsFinding} onClose={() => setImplicationsFinding(null)} />
        )}
      </div>
    </div>
  );
}

// Item card component
function ItemCard({ item, type, importance, onShowBestPractice }) {
  const importanceColors = {
    critical: 'bg-red-50 border-red-200',
    important: 'bg-orange-50 border-orange-200',
    'nice-to-have': 'bg-gray-50 border-gray-200'
  };

  if (type === 'obtained') {
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
            {item.obtained_text && (
              <p className="text-sm text-gray-700 mt-1 bg-white rounded p-2 border border-green-100">
                {item.obtained_text}
              </p>
            )}
            {item.category && (
              <span className="inline-block mt-2 px-2 py-0.5 bg-white rounded text-xs text-gray-500">
                {item.category}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg border ${importanceColors[importance] || importanceColors.important}`}>
      <div className="flex items-start gap-2">
        <Target className={`w-4 h-4 mt-0.5 ${
          importance === 'critical' ? 'text-red-500' :
          importance === 'important' ? 'text-orange-500' : 'text-gray-400'
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

// Finding card component
function FindingCard({ finding, onShowImplications }) {
  const [expanded, setExpanded] = useState(false);

  const riskColors = {
    high: 'bg-red-50 border-red-200 text-red-800',
    medium: 'bg-orange-50 border-orange-200 text-orange-800',
    low: 'bg-green-50 border-green-200 text-green-800'
  };

  const typeLabels = {
    process: 'Process',
    pain_point: 'Pain Point',
    integration: 'Integration',
    compliance: 'Compliance',
    performance: 'Performance',
    workaround: 'Workaround',
    requirement: 'Requirement',
    other: 'Other'
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <h4 className="font-medium text-gray-900">{finding.topic}</h4>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${riskColors[finding.sap_risk_level] || riskColors.medium}`}>
                {finding.sap_risk_level?.toUpperCase()} RISK
              </span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                {typeLabels[finding.finding_type] || finding.finding_type}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowImplications(finding);
                }}
                className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3" />
                Implications
              </button>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {/* Brief details always visible */}
        {finding.details && (
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">{finding.details}</p>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {finding.source_quote && (
            <div className="bg-gray-50 rounded p-3 border-l-4 border-gray-300">
              <p className="text-xs font-medium text-gray-500 mb-1">Source Quote</p>
              <p className="text-sm text-gray-700 italic">"{finding.source_quote}"</p>
            </div>
          )}

          {finding.sap_analysis && (
            <div className="bg-blue-50 rounded p-3">
              <p className="text-xs font-medium text-blue-700 mb-1">SAP Analysis</p>
              <p className="text-sm text-gray-700">{finding.sap_analysis}</p>
            </div>
          )}

          {finding.sap_recommendation && (
            <div className="bg-green-50 rounded p-3">
              <p className="text-xs font-medium text-green-700 mb-1">Recommendation</p>
              <p className="text-sm text-gray-700">{finding.sap_recommendation}</p>
            </div>
          )}

          {finding.sap_best_practice && (
            <div className="bg-purple-50 rounded p-3">
              <p className="text-xs font-medium text-purple-700 mb-1">SAP Best Practice</p>
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

export default SharedChecklist;
