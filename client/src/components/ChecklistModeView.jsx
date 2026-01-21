import { useState, useEffect, useCallback } from 'react';
import { useChunkedRecording } from '../hooks/useChunkedRecording';
import {
  getSessionChecklist,
  getSessionChecklistStats,
  uploadSessionAudio,
  analyzeSessionAudio
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
  ChevronUp
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState('missing');
  const [loading, setLoading] = useState(true);
  const [chunkProcessingStatus, setChunkProcessingStatus] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Load checklist on mount
  useEffect(() => {
    loadChecklist();
  }, [sessionId]);

  const loadChecklist = async () => {
    try {
      setLoading(true);
      const [checklistRes, statsRes] = await Promise.all([
        getSessionChecklist(sessionId),
        getSessionChecklistStats(sessionId)
      ]);
      setChecklist(checklistRes.data);
      setStats(statsRes.data);

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
    onAllChunksComplete: handleAllChunksComplete
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

          {/* Chunk processing status */}
          {chunkProcessingStatus.length > 0 && (
            <div className="mt-3 space-y-1">
              {chunkProcessingStatus.map((status, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="text-red-600">Chunk {idx + 1}:</span>
                  {status.status === 'uploading' && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Uploading...
                    </span>
                  )}
                  {status.status === 'analyzing' && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Analyzing...
                    </span>
                  )}
                  {status.status === 'complete' && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      {status.message}
                    </span>
                  )}
                  {status.status === 'error' && (
                    <span className="flex items-center gap-1 text-red-600">
                      <AlertTriangle className="w-3 h-3" />
                      Error: {status.message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-red-600 mt-2">
            Audio is automatically analyzed every 5 minutes. Keep discussing the checklist items to mark them as obtained.
          </p>
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
                      <ObtainedItemCard key={item.id} item={item} />
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
                      <ObtainedItemCard key={item.id} item={item} />
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
                      <ObtainedItemCard key={item.id} item={item} />
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

function ObtainedItemCard({ item }) {
  return (
    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-start gap-2">
        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">{item.item_text}</p>
          {item.obtained_text && (
            <p className="text-sm text-gray-700 mt-1 bg-white rounded p-2 border border-green-100">
              {item.obtained_text}
            </p>
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

export default ChecklistModeView;
