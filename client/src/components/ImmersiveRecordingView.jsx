import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Download,
  FileUp,
  RotateCcw,
  RefreshCw,
  Users,
  Loader2,
  Minimize2,
  FileDown,
  AlertCircle,
  RotateCw,
  Upload,
  Brain,
  CheckCircle2,
  XCircle,
  X,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  Mic,
  Square
} from 'lucide-react';
import FluidRecordingOrb from './FluidRecordingOrb';
import { useChunkedRecording } from '../hooks/useChunkedRecording';
import {
  getSessionChecklistStats,
  getSessionChecklist,
  uploadSessionAudio,
  analyzeSessionAudio,
  getSessionFindings,
  getExportExcelUrl,
  uploadSessionDocument,
  analyzeSessionDocument,
  reanalyzeSession,
  getTranscriptDownloadUrl,
  regenerateTranscript
} from '../services/sessionChecklistApi';

const CHUNK_DURATION_SECONDS = 60;

export default function ImmersiveRecordingView({
  workshopId,
  sessionId,
  session,
  participants = [],
  onShowParticipants,
  onStatusChange,
  onExitImmersive
}) {
  const [stats, setStats] = useState({ total: 0, obtained: 0, missing: 0 });
  const [findings, setFindings] = useState({ stats: { total: 0 }, all: [] });
  const [checklist, setChecklist] = useState({ missing: [], obtained: [] });
  const [chunkProcessingStatus, setChunkProcessingStatus] = useState([]);
  const documentInputRef = useRef(null);
  const [documentUploadStatus, setDocumentUploadStatus] = useState(null);
  const [reanalyzeStatus, setReanalyzeStatus] = useState(null);
  const [retryingChunks, setRetryingChunks] = useState(false);
  const [regeneratingTranscript, setRegeneratingTranscript] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // 'open', 'closed', 'discoveries'
  const [expandedCategory, setExpandedCategory] = useState(null); // Only one category expanded at a time
  const [expandedAnswer, setExpandedAnswer] = useState(null); // Track which answer is expanded

  useEffect(() => {
    loadStats();
  }, [sessionId]);

  const loadStats = async () => {
    try {
      const [statsRes, findingsRes, checklistRes] = await Promise.all([
        getSessionChecklistStats(sessionId),
        getSessionFindings(sessionId).catch(() => ({ data: { stats: { total: 0 }, all: [] } })),
        getSessionChecklist(sessionId).catch(() => ({ data: { missing: [], obtained: [] } }))
      ]);
      setStats(statsRes.data);
      setFindings(findingsRes.data);
      setChecklist(checklistRes.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  // Group items by category
  const groupByCategory = (items) => {
    const grouped = {};
    items.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });
    return grouped;
  };

  // Group findings by finding_type or risk level
  const groupFindings = (items) => {
    const grouped = {};
    items.forEach(item => {
      const category = item.finding_type || item.sap_risk_level || 'General';
      // Capitalize first letter
      const displayCategory = category.charAt(0).toUpperCase() + category.slice(1);
      if (!grouped[displayCategory]) {
        grouped[displayCategory] = [];
      }
      grouped[displayCategory].push(item);
    });
    return grouped;
  };

  // Toggle category - accordion style (only one open at a time)
  const toggleCategory = (category) => {
    setExpandedCategory(prev => prev === category ? null : category);
  };

  // Check if category is expanded
  const isCategoryExpanded = (category) => {
    return expandedCategory === category;
  };

  // Reset expanded category when panel changes
  useEffect(() => {
    setExpandedCategory(null);
  }, [activePanel]);

  // Handle stat orb clicks
  const handleOpenPointsClick = () => setActivePanel(activePanel === 'open' ? null : 'open');
  const handleClosedPointsClick = () => setActivePanel(activePanel === 'closed' ? null : 'closed');
  const handleDiscoveriesClick = () => setActivePanel(activePanel === 'discoveries' ? null : 'discoveries');

  const handleDocumentUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    try {
      setDocumentUploadStatus('uploading');
      const formData = new FormData();
      formData.append('document', file);
      const uploadResponse = await uploadSessionDocument(sessionId, formData);
      setDocumentUploadStatus('analyzing');
      await analyzeSessionDocument(sessionId, uploadResponse.data.id);
      setDocumentUploadStatus('complete');
      await loadStats();
      setTimeout(() => setDocumentUploadStatus(null), 2000);
    } catch (error) {
      setDocumentUploadStatus('error');
      setTimeout(() => setDocumentUploadStatus(null), 2000);
    }
  };

  const handleReanalyze = async () => {
    if (reanalyzeStatus === 'analyzing') return;
    setReanalyzeStatus('analyzing');
    try {
      await reanalyzeSession(sessionId);
      setReanalyzeStatus('complete');
      await loadStats();
      setTimeout(() => setReanalyzeStatus(null), 2000);
    } catch (error) {
      setReanalyzeStatus('error');
      setTimeout(() => setReanalyzeStatus(null), 2000);
    }
  };

  const handleRetryFailedChunks = useCallback(async () => {
    const failedWithAudioId = chunkProcessingStatus
      .map((status, index) => ({ ...status, index }))
      .filter(s => s.status === 'error' && s.audioId);

    if (failedWithAudioId.length === 0) return;

    setRetryingChunks(true);
    for (const chunk of failedWithAudioId) {
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        newStatus[chunk.index] = { status: 'analyzing', audioId: chunk.audioId };
        return newStatus;
      });
      try {
        await analyzeSessionAudio(sessionId, chunk.audioId);
        setChunkProcessingStatus(prev => {
          const newStatus = [...prev];
          newStatus[chunk.index] = { status: 'complete' };
          return newStatus;
        });
      } catch (error) {
        setChunkProcessingStatus(prev => {
          const newStatus = [...prev];
          newStatus[chunk.index] = { status: 'error', audioId: chunk.audioId };
          return newStatus;
        });
      }
    }
    setRetryingChunks(false);
    await loadStats();
  }, [sessionId, chunkProcessingStatus]);

  const handleRegenerateTranscript = async () => {
    if (regeneratingTranscript) return;
    setRegeneratingTranscript(true);
    try {
      await regenerateTranscript(sessionId);
      setRegeneratingTranscript(false);
    } catch (error) {
      setRegeneratingTranscript(false);
    }
  };

  const handleChunkReady = useCallback(async (blob, chunkIndex, duration) => {
    setChunkProcessingStatus(prev => {
      const newStatus = [...prev];
      newStatus[chunkIndex] = { status: 'uploading' };
      return newStatus;
    });

    try {
      const formData = new FormData();
      formData.append('audio', blob, `chunk-${chunkIndex}.webm`);
      formData.append('duration_seconds', Math.round(duration));
      formData.append('chunk_index', chunkIndex);

      const uploadResponse = await uploadSessionAudio(sessionId, formData);
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        newStatus[chunkIndex] = { status: 'analyzing', audioId: uploadResponse.data.id };
        return newStatus;
      });

      await analyzeSessionAudio(sessionId, uploadResponse.data.id);
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        newStatus[chunkIndex] = { status: 'complete' };
        return newStatus;
      });
      await loadStats();
    } catch (error) {
      setChunkProcessingStatus(prev => {
        const newStatus = [...prev];
        // Keep audioId if we have it (upload succeeded but analysis failed)
        const existingAudioId = prev[chunkIndex]?.audioId;
        newStatus[chunkIndex] = {
          status: 'error',
          audioId: existingAudioId,
          errorMessage: error.response?.data?.error || error.message
        };
        return newStatus;
      });
    }
  }, [sessionId]);

  const {
    isRecording,
    recordingTime,
    audioLevel,
    startRecording,
    stopRecording,
    formatTime
  } = useChunkedRecording({
    onChunkReady: handleChunkReady,
    onAllChunksComplete: loadStats,
    chunkDurationSeconds: CHUNK_DURATION_SECONDS
  });

  const processingCount = chunkProcessingStatus.filter(s => s.status === 'uploading' || s.status === 'analyzing').length;

  return (
    <div className="h-[calc(100vh-70px)] bg-white flex flex-col overflow-hidden">
      <input
        type="file"
        ref={documentInputRef}
        onChange={handleDocumentUpload}
        accept=".pdf,.doc,.docx,.txt,.csv"
        className="hidden"
      />

      {/* Minimal header with tiny icons */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <Link to={`/workshop/${workshopId}`} className="p-0.5 hover:bg-gray-100 rounded" title="Back">
            <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
          </Link>
          <span className="text-xs text-gray-400">
            <span className="font-semibold text-purple-500">S{session?.session_number}</span>
            <span className="ml-1">{session?.name}</span>
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Real-time chunk status indicator */}
          {chunkProcessingStatus.length > 0 && (
            <div className="flex items-center gap-1 mr-2 px-2 py-0.5 bg-gray-50 rounded-full border border-gray-200">
              {/* Chunk dots */}
              <div className="flex items-center gap-0.5">
                {chunkProcessingStatus.map((chunk, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-all cursor-help ${
                      chunk.status === 'uploading' ? 'bg-yellow-400 animate-pulse' :
                      chunk.status === 'analyzing' ? 'bg-blue-500 animate-pulse' :
                      chunk.status === 'complete' ? 'bg-green-500' :
                      chunk.status === 'error' ? 'bg-red-500 animate-pulse' :
                      'bg-gray-300'
                    }`}
                    title={`Chunk ${idx + 1}: ${chunk.status}${chunk.errorMessage ? ` - ${chunk.errorMessage}` : ''}${chunk.audioId ? ' (can retry)' : ''}`}
                  />
                ))}
              </div>

              {/* Status summary */}
              <div className="flex items-center gap-1 ml-1 text-[10px]">
                {chunkProcessingStatus.some(s => s.status === 'uploading') && (
                  <span className="flex items-center gap-0.5 text-yellow-600">
                    <Upload className="w-2.5 h-2.5" />
                    {chunkProcessingStatus.filter(s => s.status === 'uploading').length}
                  </span>
                )}
                {chunkProcessingStatus.some(s => s.status === 'analyzing') && (
                  <span className="flex items-center gap-0.5 text-blue-600">
                    <Brain className="w-2.5 h-2.5 animate-pulse" />
                    {chunkProcessingStatus.filter(s => s.status === 'analyzing').length}
                  </span>
                )}
                {chunkProcessingStatus.some(s => s.status === 'complete') && (
                  <span className="flex items-center gap-0.5 text-green-600">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    {chunkProcessingStatus.filter(s => s.status === 'complete').length}
                  </span>
                )}
                {chunkProcessingStatus.some(s => s.status === 'error') && (
                  <span className="flex items-center gap-0.5 text-red-600">
                    <XCircle className="w-2.5 h-2.5" />
                    {chunkProcessingStatus.filter(s => s.status === 'error').length}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Failed chunks retry button */}
          {chunkProcessingStatus.some(s => s.status === 'error' && s.audioId) && (
            <button
              onClick={handleRetryFailedChunks}
              disabled={retryingChunks}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-600 bg-red-50 hover:bg-red-100 rounded disabled:opacity-30"
              title={`Retry ${chunkProcessingStatus.filter(s => s.status === 'error' && s.audioId).length} failed chunks`}
            >
              {retryingChunks ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Retry
            </button>
          )}

          {/* Tiny action icons */}
          <button
            onClick={() => window.open(getExportExcelUrl(sessionId), '_blank')}
            disabled={isRecording || stats.total === 0}
            className="p-1 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded disabled:opacity-30"
            title="Export Excel"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <a
            href={getTranscriptDownloadUrl(sessionId)}
            download
            className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded"
            title="Download Transcript"
          >
            <FileDown className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={handleRegenerateTranscript}
            disabled={regeneratingTranscript}
            className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded disabled:opacity-30"
            title="Regenerate Transcript"
          >
            {regeneratingTranscript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => documentInputRef.current?.click()}
            disabled={documentUploadStatus === 'uploading' || documentUploadStatus === 'analyzing'}
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded disabled:opacity-30"
            title="Upload Document"
          >
            {documentUploadStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleReanalyze}
            disabled={isRecording || reanalyzeStatus === 'analyzing'}
            className="p-1 text-gray-400 hover:text-purple-600 hover:bg-gray-100 rounded disabled:opacity-30"
            title="Re-analyse All"
          >
            {reanalyzeStatus === 'analyzing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={loadStats} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="Refresh Stats">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {onShowParticipants && (
            <button onClick={onShowParticipants} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="Participants">
              <Users className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button
            onClick={onExitImmersive}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Exit Immersive Mode"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Recording alert title - absolutely positioned, doesn't shift layout */}
        {isRecording && (
          <div className="absolute top-4 left-8 z-10 flex items-center gap-3 recording-alert-pulse">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span className="text-2xl font-bold text-red-600 tracking-wide">Alert: I am listening and recording</span>
          </div>
        )}

        {/* Main container - split into left (blobs) and right (points) */}
        <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDE - Recording orb + Stats (NEVER changes) */}
        <div className="w-1/2 relative border-r border-gray-200 bg-white">
          {/* Recording Orb - positioned independently */}
          <div className="absolute left-28 top-[40%] -translate-y-1/2 cursor-pointer" onClick={isRecording ? stopRecording : startRecording}>
            <svg width="400" height="400" viewBox="0 0 200 200" className="overflow-visible">
              <defs>
                <filter id="goo-extreme" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                  <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -12" result="goo" />
                </filter>
              </defs>
              {isRecording && [...Array(6)].map((_, i) => (
                <path
                  key={i}
                  d="M100,8 C130,5 165,25 185,60 C200,95 195,135 170,165 C145,190 120,200 85,195 C50,190 20,160 10,120 C0,80 15,45 45,25 C75,5 70,11 100,8"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="0.5"
                  className={`amoeba-pulse-${i % 3}`}
                  style={{ transformOrigin: 'center', animationDelay: `${i * 0.5}s`, opacity: 0 }}
                />
              ))}
              <path
                d="M100,5 C140,0 175,20 190,55 C205,90 195,140 165,175 C135,205 95,210 55,185 C20,160 0,115 10,70 C20,30 60,10 100,5"
                fill="none"
                stroke={isRecording ? "#ef4444" : "#8b5cf6"}
                strokeWidth="0.6"
                opacity="0.8"
                className={isRecording ? "amoeba-recording-1" : "amoeba-idle-1"}
                filter="url(#goo-extreme)"
              />
              <path
                d="M100,15 C135,12 168,35 180,65 C195,100 185,145 155,172 C125,200 80,205 48,178 C18,152 5,108 15,68 C28,30 65,18 100,15"
                fill="none"
                stroke={isRecording ? "#ef4444" : "#8b5cf6"}
                strokeWidth="0.5"
                opacity="0.5"
                className={isRecording ? "amoeba-recording-2" : "amoeba-idle-2"}
              />
              {!isRecording && (
                <>
                  <circle cx="70" cy="70" r="4" fill="#8b5cf6" opacity="0.15" className="nucleus-float-1" />
                  <circle cx="130" cy="80" r="3" fill="#8b5cf6" opacity="0.12" className="nucleus-float-2" />
                </>
              )}
              {isRecording && (
                <ellipse cx="100" cy="100" rx="55" ry="52" fill="#ef4444" opacity="0.08" className="core-pulse-1" />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {isRecording ? (
                <>
                  <Square className="w-16 h-16 text-red-600 mb-2 drop-shadow-lg" fill="#ef4444" />
                  <span className="text-red-600 text-5xl font-bold tracking-wider drop-shadow-md">{formatTime(recordingTime)}</span>
                  <span className="text-red-500 text-sm font-semibold mt-1">Tap to Stop</span>
                </>
              ) : (
                <>
                  <Mic className="w-20 h-20 text-purple-500 mb-2" />
                  <span className="text-purple-600 text-lg font-medium">Record</span>
                </>
              )}
            </div>
          </div>

          {/* Stats Dashboard - positioned independently */}
          <div className="absolute right-8 top-[40%] -translate-y-1/2 flex flex-col gap-4">
            {/* Open Points */}
            <div
              className="cursor-pointer group text-center"
              onClick={handleOpenPointsClick}
            >
              <div className="relative w-20 h-20 mx-auto mb-1 transition-transform group-hover:scale-110">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#fee2e2" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#ef4444" strokeWidth="8"
                    strokeDasharray={`${(stats.missing / (stats.total || 1)) * 283} 283`}
                    strokeLinecap="round" transform="rotate(-90 50 50)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-xl font-bold text-red-600">{stats.missing}</span>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-600 group-hover:text-red-600">Open</span>
            </div>

            {/* Closed Points */}
            <div
              className="cursor-pointer group text-center"
              onClick={handleClosedPointsClick}
            >
              <div className="relative w-20 h-20 mx-auto mb-1 transition-transform group-hover:scale-110">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#dcfce7" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#22c55e" strokeWidth="8"
                    strokeDasharray={`${(stats.obtained / (stats.total || 1)) * 283} 283`}
                    strokeLinecap="round" transform="rotate(-90 50 50)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-xl font-bold text-green-600">{stats.obtained}</span>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-600 group-hover:text-green-600">Closed</span>
            </div>

            {/* Discoveries */}
            <div
              className="cursor-pointer group text-center"
              onClick={handleDiscoveriesClick}
            >
              <div className="relative w-20 h-20 mx-auto mb-1 transition-transform group-hover:scale-110">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#fef3c7" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#f59e0b" strokeWidth="8"
                    strokeDasharray={`${Math.min((findings.all?.length || 0) / 50, 1) * 283} 283`}
                    strokeLinecap="round" transform="rotate(-90 50 50)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span className="text-xl font-bold text-amber-600">{findings.all?.length || 0}</span>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-600 group-hover:text-amber-600">Found</span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Points Panel (shows preview or detail) */}
        <div className="w-1/2 bg-gray-50 flex flex-col overflow-hidden">
          {!activePanel ? (
            /* Preview cards when no panel is active */
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="grid grid-cols-1 gap-4">
                {/* Open Points Preview */}
                <div
                  className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-red-300 transition-all"
                  onClick={handleOpenPointsClick}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <span className="font-semibold text-gray-800">Open Points</span>
                    </div>
                    <span className="text-2xl font-bold text-red-600">{stats.missing}</span>
                  </div>
                  <div className="space-y-1">
                    {(checklist.missing || []).slice(0, 3).map((item, idx) => (
                      <div key={idx} className="text-xs text-gray-600 truncate flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-red-400" />
                        {item.item_text}
                      </div>
                    ))}
                    {(checklist.missing?.length || 0) > 3 && (
                      <div className="text-xs text-red-500 font-medium">+{checklist.missing.length - 3} more</div>
                    )}
                  </div>
                </div>

                {/* Closed Points Preview */}
                <div
                  className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-green-300 transition-all"
                  onClick={handleClosedPointsClick}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="font-semibold text-gray-800">Closed Points</span>
                    </div>
                    <span className="text-2xl font-bold text-green-600">{stats.obtained}</span>
                  </div>
                  <div className="space-y-1">
                    {(checklist.obtained || []).slice(0, 3).map((item, idx) => (
                      <div key={idx} className="text-xs text-gray-600 truncate flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-green-400" />
                        {item.item_text}
                      </div>
                    ))}
                    {(checklist.obtained?.length || 0) > 3 && (
                      <div className="text-xs text-green-500 font-medium">+{checklist.obtained.length - 3} more</div>
                    )}
                  </div>
                </div>

                {/* Discoveries Preview */}
                <div
                  className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-amber-300 transition-all"
                  onClick={handleDiscoveriesClick}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-amber-500" />
                      <span className="font-semibold text-gray-800">Discoveries</span>
                    </div>
                    <span className="text-2xl font-bold text-amber-600">{findings.all?.length || 0}</span>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{findings.stats?.highRisk || 0} High</span>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{findings.stats?.mediumRisk || 0} Med</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{findings.stats?.lowRisk || 0} Low</span>
                  </div>
                  <div className="space-y-1">
                    {(findings.all || []).slice(0, 2).map((finding, idx) => (
                      <div key={idx} className="text-xs text-gray-600 truncate flex items-center gap-1">
                        <span className={`w-1 h-1 rounded-full ${finding.sap_risk_level === 'high' ? 'bg-red-400' : finding.sap_risk_level === 'medium' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                        {finding.topic}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress Summary */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-4">
                  <div className="text-sm font-semibold text-purple-800 mb-2">Session Progress</div>
                  <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                      style={{ width: `${stats.total ? (stats.obtained / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-600">
                    <span>{stats.obtained} of {stats.total} items covered</span>
                    <span className="font-semibold text-purple-600">{stats.total ? Math.round((stats.obtained / stats.total) * 100) : 0}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Detail Panel when a category is selected */
            <>
              {/* Panel Header - Compact */}
              <div className={`flex items-center justify-between px-3 py-2 border-b ${
                activePanel === 'open' ? 'bg-red-50 border-red-200' :
                activePanel === 'closed' ? 'bg-green-50 border-green-200' :
                'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center gap-1.5">
                  {activePanel === 'open' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                  {activePanel === 'closed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                  {activePanel === 'discoveries' && <Lightbulb className="w-4 h-4 text-amber-500" />}
                  <span className={`font-semibold text-sm ${
                    activePanel === 'open' ? 'text-red-700' :
                    activePanel === 'closed' ? 'text-green-700' :
                    'text-amber-700'
                  }`}>
                    {activePanel === 'open' && `Open Points (${stats.missing})`}
                    {activePanel === 'closed' && `Closed Points (${stats.obtained})`}
                    {activePanel === 'discoveries' && `Discoveries (${findings.all?.length || 0})`}
                  </span>
                </div>
                <button
                  onClick={() => setActivePanel(null)}
                  className="p-0.5 hover:bg-white/50 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Panel Content - Compact */}
              <div className="flex-1 overflow-y-auto p-2">
                {/* Open Points - Simple: Category + Question (answered ones in green) */}
                {activePanel === 'open' && (() => {
                  // Combine all items, mark obtained ones
                  const allItems = [
                    ...(checklist.missing || []).map(item => ({ ...item, isObtained: false })),
                    ...(checklist.obtained || []).map(item => ({ ...item, isObtained: true }))
                  ];
                  const grouped = Object.entries(groupByCategory(allItems));
                  let runningIndex = 0;
                  return (
                    <div className="space-y-1">
                      {grouped.map(([category, items]) => {
                        const startIndex = runningIndex;
                        runningIndex += items.length;
                        const openCount = items.filter(i => !i.isObtained).length;
                        const closedCount = items.filter(i => i.isObtained).length;
                        return (
                          <div key={category} className="bg-white border border-gray-200 rounded overflow-hidden">
                            <button
                              onClick={() => toggleCategory(`open-${category}`)}
                              className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50 hover:bg-gray-100"
                            >
                              <span className="font-medium text-sm text-gray-700">{category}</span>
                              <div className="flex items-center gap-2">
                                {openCount > 0 && <span className="text-xs text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">{openCount}</span>}
                                {closedCount > 0 && <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">{closedCount}</span>}
                                {isCategoryExpanded(`open-${category}`) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </div>
                            </button>
                            {isCategoryExpanded(`open-${category}`) && (
                              <div className="px-3 py-1">
                                {items.map((item, idx) => {
                                  const globalIdx = startIndex + idx;
                                  const itemKey = `open-${globalIdx}`;
                                  const isExpanded = expandedAnswer === itemKey;
                                  return (
                                    <div key={idx} className="border-b border-gray-100 last:border-0">
                                      <div
                                        className={`py-1 text-sm flex gap-2 ${item.isObtained ? 'text-green-600 cursor-pointer hover:bg-green-50' : 'text-gray-800'}`}
                                        onClick={() => item.isObtained && setExpandedAnswer(isExpanded ? null : itemKey)}
                                      >
                                        <span className={`flex-shrink-0 ${item.isObtained ? 'text-green-400' : 'text-gray-400'}`}>{startIndex + idx + 1}.</span>
                                        <span className="flex-1">{item.suggested_question || item.item_text}</span>
                                        {item.isObtained && (isExpanded ? <ChevronDown className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />)}
                                      </div>
                                      {item.isObtained && isExpanded && (
                                        <div className="ml-6 mb-2 p-2 text-sm bg-green-50 border-l-2 border-green-500 text-gray-700">
                                          {item.obtained_text || item.obtained_value || 'Answer confirmed but details not captured'}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {grouped.length === 0 && (
                        <div className="text-center text-gray-500 py-4 text-sm">No open points</div>
                      )}
                    </div>
                  );
                })()}

                {/* Closed Points */}
                {activePanel === 'closed' && (
                  <div className="space-y-1">
                    {Object.entries(groupByCategory(checklist.obtained || [])).map(([category, items]) => (
                      <div key={category} className="bg-white border border-gray-200 rounded overflow-hidden">
                        <button
                          onClick={() => toggleCategory(`closed-${category}`)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100"
                        >
                          <span className="font-medium text-sm text-gray-700">{category}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">{items.length}</span>
                            {isCategoryExpanded(`closed-${category}`) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </div>
                        </button>
                        {isCategoryExpanded(`closed-${category}`) && (
                          <div className="divide-y divide-gray-100">
                            {items.map((item, idx) => (
                              <div key={idx} className="px-3 py-1.5 hover:bg-gray-50">
                                <div className="flex items-start gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-gray-500">{item.item_text}</div>
                                    {(item.obtained_text || item.obtained_value) ? (
                                      <div className="text-sm text-gray-900 bg-green-50 p-1.5 rounded border-l-2 border-green-500 mt-0.5">
                                        {item.obtained_text || item.obtained_value}
                                      </div>
                                    ) : (
                                      <div className="text-gray-400 italic text-xs">Details not captured</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {Object.keys(groupByCategory(checklist.obtained || [])).length === 0 && (
                      <div className="text-center text-gray-500 py-4 text-sm">No closed points yet</div>
                    )}
                  </div>
                )}

                {/* Discoveries - Categorized */}
                {activePanel === 'discoveries' && (
                  <div className="space-y-1">
                    {Object.entries(groupFindings(findings.all || [])).map(([category, items]) => {
                      const hasHigh = items.some(f => f.sap_risk_level === 'high');
                      const hasMedium = items.some(f => f.sap_risk_level === 'medium');
                      const categoryColor = hasHigh ? 'red' : hasMedium ? 'amber' : 'blue';

                      return (
                        <div key={category} className="bg-white border border-gray-200 rounded overflow-hidden">
                          <button
                            onClick={() => toggleCategory(`discoveries-${category}`)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100"
                          >
                            <div className="flex items-center gap-1.5">
                              <Lightbulb className={`w-3 h-3 text-${categoryColor}-500`} />
                              <span className="font-medium text-sm text-gray-700">{category}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs text-${categoryColor}-600 bg-${categoryColor}-100 px-1.5 py-0.5 rounded-full`}>{items.length}</span>
                              {isCategoryExpanded(`discoveries-${category}`) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </div>
                          </button>
                          {isCategoryExpanded(`discoveries-${category}`) && (
                            <div className="divide-y divide-gray-100">
                              {items.map((finding, idx) => (
                                <div key={idx} className="px-3 py-1.5 hover:bg-gray-50">
                                  <div className="flex items-start gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                                      finding.sap_risk_level === 'high' ? 'bg-red-500' :
                                      finding.sap_risk_level === 'medium' ? 'bg-amber-500' :
                                      'bg-blue-500'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-sm text-gray-800">{finding.topic}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                          finding.sap_risk_level === 'high' ? 'bg-red-100 text-red-700' :
                                          finding.sap_risk_level === 'medium' ? 'bg-amber-100 text-amber-700' :
                                          'bg-blue-100 text-blue-700'
                                        }`}>
                                          {finding.sap_risk_level || 'info'}
                                        </span>
                                      </div>
                                      {finding.details && (
                                        <div className="text-gray-600 text-xs mt-0.5">{finding.details}</div>
                                      )}
                                      {finding.sap_recommendation && (
                                        <div className="text-xs text-blue-700 bg-blue-50 px-1.5 py-1 rounded mt-1">
                                          → {finding.sap_recommendation}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(!findings.all || findings.all.length === 0) && (
                      <div className="text-center text-gray-500 py-4 text-sm">No discoveries yet</div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
