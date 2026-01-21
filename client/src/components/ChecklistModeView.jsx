import { useState, useEffect, useCallback, useRef } from 'react';
import { useChunkedRecording } from '../hooks/useChunkedRecording';
import {
  getSessionChecklist,
  getSessionChecklistStats,
  uploadSessionAudio,
  analyzeSessionAudio,
  getSessionFindings,
  updateChecklistItem,
  getExportExcelUrl
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
  Download
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
  const [activeTab, setActiveTab] = useState('missing');
  const [loading, setLoading] = useState(true);
  const [chunkProcessingStatus, setChunkProcessingStatus] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [chunkDuration, setChunkDuration] = useState(60); // Default 1 minute
  const settingsRef = useRef(null);

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
      const [checklistRes, statsRes, findingsRes] = await Promise.all([
        getSessionChecklist(sessionId),
        getSessionChecklistStats(sessionId),
        getSessionFindings(sessionId).catch(() => ({ data: { all: [], stats: { total: 0, highRisk: 0, mediumRisk: 0, lowRisk: 0 } } }))
      ]);
      setChecklist(checklistRes.data);
      setStats(statsRes.data);
      setFindings(findingsRes.data);

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
        </div>
      </div>
    </div>
  );
}

// Sub-components
function MissingItemCard({ item, importance }) {
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
          <p className="text-sm font-medium text-gray-900">{item.item_text}</p>
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

function ObtainedItemCard({ item, sessionId, onUpdate }) {
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
          <p className="text-sm font-medium text-gray-900">{item.item_text}</p>

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
