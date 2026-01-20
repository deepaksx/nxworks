import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getQuestion,
  saveAnswer,
  uploadAudio,
  uploadDocument,
  deleteAudio,
  deleteDocument,
  getParticipants,
  transcribeAudio,
  createObservation,
  getAllObservations,
  resetQuestionData,
  createInitialChecklist
} from '../services/api';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle,
  Circle,
  AlertTriangle,
  Mic,
  Square,
  Trash2,
  Upload,
  Download,
  Clock,
  FileText,
  Loader2,
  Sparkles,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  File,
  MessageSquare,
  Headphones,
  FolderOpen,
  BarChart3,
  Copy,
  Check,
  TrendingUp,
  Target,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

const entityColors = {
  ARDC: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800' },
  ENF: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  GF: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-800' }
};

function QuestionView() {
  const { workshopId, sessionId, questionId } = useParams();
  const navigate = useNavigate();
  const [question, setQuestion] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('observation');

  const [textResponse, setTextResponse] = useState('');
  const [respondentName, setRespondentName] = useState('');
  const [respondentRole, setRespondentRole] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('pending');
  const [selectedParticipantId, setSelectedParticipantId] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [pendingAudios, setPendingAudios] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  const fileInputRef = useRef(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [transcribingId, setTranscribingId] = useState(null);
  const [creatingObservation, setCreatingObservation] = useState(false);
  const [observations, setObservations] = useState([]);
  const [resetting, setResetting] = useState(false);
  const [expandedTranscriptions, setExpandedTranscriptions] = useState({});
  const [copiedQuestion, setCopiedQuestion] = useState(null);
  const [checklistTab, setChecklistTab] = useState('missing'); // 'missing', 'obtained', or 'findings'

  // Auto-processing pipeline state
  const [processingAudio, setProcessingAudio] = useState(false);
  const [processingStep, setProcessingStep] = useState(''); // 'saving', 'uploading', 'transcribing', 'analyzing'
  const [processingProgress, setProcessingProgress] = useState(0);

  // Initial checklist generation state
  const [generatingInitialChecklist, setGeneratingInitialChecklist] = useState(false);
  const initialChecklistFetchedRef = useRef(false);

  useEffect(() => {
    // Reset the initial checklist flag when question changes
    initialChecklistFetchedRef.current = false;
    loadData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      pendingAudios.forEach(a => URL.revokeObjectURL(a.url));
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, [questionId]);

  // Auto-generate initial checklist when entering a question with no observations
  useEffect(() => {
    const generateInitialChecklist = async () => {
      // Only run if: loaded, no observations, haven't tried yet, not currently processing
      if (loading || observations.length > 0 || initialChecklistFetchedRef.current || generatingInitialChecklist || processingAudio) {
        return;
      }

      initialChecklistFetchedRef.current = true;
      setGeneratingInitialChecklist(true);
      setActiveTab('observation'); // Switch to observation tab

      try {
        await createInitialChecklist(questionId);
        await loadData();
        setChecklistTab('missing'); // Show missing tab to highlight what to collect
      } catch (error) {
        console.error('Failed to generate initial checklist:', error);
        // Silent fail - user can manually click Analyze later
      } finally {
        setGeneratingInitialChecklist(false);
      }
    };

    generateInitialChecklist();
  }, [loading, observations.length, questionId, generatingInitialChecklist, processingAudio]);

  const loadData = async () => {
    try {
      const [questionRes, participantsRes, observationsRes] = await Promise.all([
        getQuestion(questionId),
        getParticipants(sessionId),
        getAllObservations(questionId)
      ]);
      setQuestion(questionRes.data);
      setParticipants(participantsRes.data);
      setObservations(observationsRes.data.observations || []);

      if (questionRes.data.answer) {
        setTextResponse(questionRes.data.answer.text_response || '');
        setRespondentName(questionRes.data.answer.respondent_name || '');
        setRespondentRole(questionRes.data.answer.respondent_role || '');
        setNotes(questionRes.data.answer.notes || '');
        setStatus(questionRes.data.answer.status || 'pending');

        const matchedParticipant = participantsRes.data.find(
          p => p.name === questionRes.data.answer.respondent_name
        );
        if (matchedParticipant) {
          setSelectedParticipantId(matchedParticipant.id.toString());
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleParticipantChange = (participantId) => {
    setSelectedParticipantId(participantId);
    if (participantId && participantId !== 'other') {
      const participant = participants.find(p => p.id.toString() === participantId);
      if (participant) {
        setRespondentName(participant.name);
        setRespondentRole(participant.role || '');
      }
    }
  };

  const handleSave = async (newStatus = null) => {
    setSaving(true);
    try {
      const response = await saveAnswer(questionId, {
        text_response: textResponse,
        respondent_name: respondentName,
        respondent_role: respondentRole,
        notes,
        status: newStatus || status
      });
      setStatus(response.data.status);

      if (pendingAudios.length > 0 && response.data.id) {
        for (const audio of pendingAudios) {
          const formData = new FormData();
          formData.append('audio', audio.blob, 'recording.webm');
          formData.append('duration_seconds', Math.round(audio.duration));
          await uploadAudio(response.data.id, formData);
          URL.revokeObjectURL(audio.url);
        }
        setPendingAudios([]);
      }
      await loadData();
    } catch (error) {
      console.error('Failed to save answer:', error);
      alert('Failed to save answer.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Delete all data for this question?')) return;
    setResetting(true);
    try {
      await resetQuestionData(questionId);
      setTextResponse(''); setRespondentName(''); setRespondentRole('');
      setNotes(''); setStatus('pending'); setSelectedParticipantId('');
      setPendingAudios([]); setObservations([]);
      await loadData();
    } catch (error) {
      alert('Failed to reset.');
    } finally {
      setResetting(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      const updateAudioLevel = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(Math.min(100, average * 1.5));
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
      }
      mediaRecorderRef.current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const duration = recordingTime;
        stream.getTracks().forEach((track) => track.stop());
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) audioContextRef.current.close();
        setAudioLevel(0);

        // Auto-process: upload, transcribe, and analyze
        autoProcessAudio(blob, duration);
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } catch (error) {
      alert('Could not access microphone: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  };

  // Auto-process audio: save -> upload -> transcribe -> analyze
  const autoProcessAudio = async (audioBlob, duration) => {
    setProcessingAudio(true);
    setActiveTab('observation'); // Switch to observation tab to show progress

    try {
      // Step 1: Save answer if not exists
      setProcessingStep('saving');
      setProcessingProgress(10);

      let answerId = question.answer?.id;
      if (!answerId) {
        const saveResponse = await saveAnswer(questionId, {
          text_response: textResponse,
          respondent_name: respondentName,
          respondent_role: respondentRole,
          notes,
          status: 'in_progress'
        });
        answerId = saveResponse.data.id;
        setStatus('in_progress');
      }

      // Step 2: Upload audio
      setProcessingStep('uploading');
      setProcessingProgress(25);

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('duration_seconds', Math.round(duration));
      const uploadResponse = await uploadAudio(answerId, formData);
      const audioId = uploadResponse.data.id;

      // Step 3: Transcribe
      setProcessingStep('transcribing');
      setProcessingProgress(50);

      const transcribeResponse = await transcribeAudio(audioId);
      const transcription = transcribeResponse.data.cleaned_transcription;

      // Update text response with transcription
      setTextResponse(prev => prev.trim()
        ? prev + '\n\n--- Transcription ---\n' + transcription
        : transcription
      );

      // Step 4: Generate observation
      setProcessingStep('analyzing');
      setProcessingProgress(75);

      await createObservation(questionId);

      // Complete
      setProcessingProgress(100);
      setProcessingStep('complete');

      // Reload data to get updated observations
      await loadData();

      // Brief pause to show completion
      setTimeout(() => {
        setProcessingAudio(false);
        setProcessingStep('');
        setProcessingProgress(0);
      }, 1500);

    } catch (error) {
      console.error('Auto-processing failed:', error);
      setProcessingStep('error');
      setTimeout(() => {
        setProcessingAudio(false);
        setProcessingStep('');
        setProcessingProgress(0);
        alert('Processing failed: ' + (error.response?.data?.error || error.message));
      }, 2000);
    }
  };

  const discardPendingAudio = (index) => {
    setPendingAudios(prev => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

  const handleDeleteAudio = async (audioId) => {
    if (!confirm('Delete this recording?')) return;
    try { await deleteAudio(audioId); await loadData(); } catch (error) { console.error(error); }
  };

  const handleTranscribe = async (audioId) => {
    setTranscribingId(audioId);
    try {
      const response = await transcribeAudio(audioId);
      setTextResponse(prev => prev.trim() ? prev + '\n\n--- Transcription ---\n' + response.data.cleaned_transcription : response.data.cleaned_transcription);
      await loadData();
    } catch (error) {
      alert('Transcription failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setTranscribingId(null);
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!question.answer) await handleSave();
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      if (question.answer?.id) { await uploadDocument(question.answer.id, formData); await loadData(); }
    } catch (error) { alert('Failed to upload document.'); }
    finally { setUploadingFile(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleDeleteDocument = async (docId) => {
    if (!confirm('Delete this document?')) return;
    try { await deleteDocument(docId); await loadData(); } catch (error) { console.error(error); }
  };

  const handleCreateObservation = async () => {
    setCreatingObservation(true);
    try {
      await createObservation(questionId);
      await loadData();
    } catch (error) {
      alert('Failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setCreatingObservation(false);
    }
  };

  const handleGenerateInitialChecklist = async (force = false) => {
    if (force && !confirm('This will regenerate the initial checklist. Continue?')) return;
    setGeneratingInitialChecklist(true);
    try {
      await createInitialChecklist(questionId, force);
      await loadData();
      setChecklistTab('missing');
    } catch (error) {
      alert('Failed to generate checklist: ' + (error.response?.data?.error || error.message));
    } finally {
      setGeneratingInitialChecklist(false);
    }
  };

  // Check if question is complete enough to proceed to next
  const isQuestionComplete = () => {
    // Question is complete if status is 'completed' OR all critical/important items are obtained
    if (status === 'completed') return true;
    if (!currentObs) return false;

    const criticalMissing = currentObs.missing_info?.filter(i => i.importance === 'critical') || [];
    const importantMissing = currentObs.missing_info?.filter(i => i.importance === 'important') || [];

    // Allow proceeding if no critical or important items are missing
    return criticalMissing.length === 0 && importantMissing.length === 0;
  };

  const handleNavigateNext = () => {
    if (!question.navigation?.next) return;

    if (!isQuestionComplete()) {
      const criticalCount = currentObs?.missing_info?.filter(i => i.importance === 'critical').length || 0;
      const importantCount = currentObs?.missing_info?.filter(i => i.importance === 'important').length || 0;

      let message = 'This question is not fully answered.\n\n';
      if (criticalCount > 0) message += `• ${criticalCount} critical item(s) still missing\n`;
      if (importantCount > 0) message += `• ${importantCount} important item(s) still missing\n`;
      message += '\nComplete the question or mark it as completed to proceed.';

      alert(message);
      return;
    }

    navigate(`/workshop/${workshopId}/session/${sessionId}/question/${question.navigation.next.id}`);
  };

  const toggleTranscription = (id) => {
    setExpandedTranscriptions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const truncateText = (text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedQuestion(id);
    setTimeout(() => setCopiedQuestion(null), 2000);
  };

  const copyAllMissingQuestions = () => {
    if (!currentObs?.missing_info) return;
    const questions = currentObs.missing_info
      .filter(item => item.suggested_question)
      .map((item, i) => `${i + 1}. ${item.suggested_question}`)
      .join('\n');
    navigator.clipboard.writeText(questions);
    setCopiedQuestion('all');
    setTimeout(() => setCopiedQuestion(null), 2000);
  };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-nxsys-500" /></div>;
  if (!question) return <div className="text-center py-4"><p className="text-gray-500 text-sm">Question not found</p></div>;

  const colors = entityColors[question.entity_code] || entityColors.ARDC;
  // Always use the latest observation (no version selection)
  const currentObs = observations.length > 0 ? observations[observations.length - 1] : null;
  const totalObtained = currentObs?.obtained_info?.length || 0;
  const totalMissing = currentObs?.missing_info?.length || 0;
  const totalItems = totalObtained + totalMissing;
  const completionPercent = totalItems > 0 ? Math.round((totalObtained / totalItems) * 100) : 0;
  const audioCount = question.audioRecordings?.length || 0;
  const docCount = question.documents?.length || 0;

  // Group missing items by importance
  const criticalMissing = currentObs?.missing_info?.filter(i => i.importance === 'critical') || [];
  const importantMissing = currentObs?.missing_info?.filter(i => i.importance === 'important') || [];
  const niceMissing = currentObs?.missing_info?.filter(i => i.importance === 'nice-to-have') || [];

  // Additional findings
  const additionalFindings = currentObs?.additional_findings || [];
  const totalFindings = additionalFindings.length;

  const tabs = [
    { id: 'observation', label: 'Checklist', icon: BarChart3, count: null, processing: processingAudio || generatingInitialChecklist },
    { id: 'audio', label: 'Audio', icon: Headphones, count: audioCount || null, processing: isRecording },
    { id: 'docs', label: 'Docs', icon: FolderOpen, count: docCount || null },
    { id: 'response', label: 'Text Response', icon: MessageSquare, count: null },
  ];

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className={`rounded-lg border ${colors.border} ${colors.bg} p-2`}>
        <div className="flex items-center justify-between mb-1.5">
          <Link to={`/workshop/${workshopId}/session/${sessionId}`} className="flex items-center text-gray-600 hover:text-gray-900 text-xs">
            <ChevronLeft className="w-3 h-3" />Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white">
              {[
                { val: 'pending', icon: Circle, color: 'text-gray-400', bg: 'bg-gray-100' },
                { val: 'in_progress', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-100' },
                { val: 'completed', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' }
              ].map(s => (
                <button key={s.val} onClick={() => { setStatus(s.val); handleSave(s.val); }}
                  className={`p-1 ${status === s.val ? s.bg : 'hover:bg-gray-50'}`} title={s.val}>
                  <s.icon className={`w-3 h-3 ${status === s.val ? s.color : 'text-gray-300'}`} />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              {question.navigation?.previous && (
                <Link to={`/workshop/${workshopId}/session/${sessionId}/question/${question.navigation.previous.id}`}
                  className="p-1 rounded border border-gray-300 hover:bg-white bg-white/50"><ChevronLeft className="w-3 h-3" /></Link>
              )}
              <span className="text-xs text-gray-600 px-1">Q{question.question_number}</span>
              {question.navigation?.next && (
                <button onClick={handleNavigateNext}
                  className={`p-1 rounded border hover:bg-white bg-white/50 ${
                    isQuestionComplete() ? 'border-gray-300' : 'border-amber-400 bg-amber-50'
                  }`}
                  title={isQuestionComplete() ? 'Go to next question' : 'Complete this question first'}>
                  <ChevronRight className={`w-3 h-3 ${isQuestionComplete() ? '' : 'text-amber-600'}`} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-white p-2.5 rounded-lg border-2 border-nxsys-200 shadow-sm">
          <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold bg-nxsys-500 text-white">
            {question.question_number}
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {question.entity_code && <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors.badge}`}>{question.entity_code}</span>}
              {question.is_critical && <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500 text-xs text-white font-semibold"><AlertTriangle className="w-3 h-3" />Critical</span>}
            </div>
            <p className="text-gray-900 text-base font-semibold leading-snug">{question.question_text}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id ? 'border-nxsys-500 text-nxsys-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${tab.processing ? 'animate-pulse' : ''}`}>
              {tab.processing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
              ) : (
                <tab.icon className="w-3.5 h-3.5" />
              )}
              {tab.label}
              {tab.count && !tab.processing && <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === tab.id ? 'bg-nxsys-100 text-nxsys-700' : 'bg-gray-100'}`}>{tab.count}</span>}
              {tab.processing && <span className="px-1.5 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">...</span>}
            </button>
          ))}
        </div>

        <div className="p-2">
          {/* Response Tab */}
          {activeTab === 'response' && (
            <div className="space-y-3">
              <select value={selectedParticipantId} onChange={(e) => handleParticipantChange(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                <option value="">Select respondent...</option>
                {participants.map((p) => <option key={p.id} value={p.id.toString()}>{p.name} - {p.role}</option>)}
                <option value="other">Other</option>
              </select>
              {selectedParticipantId === 'other' && (
                <div className="flex gap-2">
                  <input type="text" value={respondentName} onChange={(e) => setRespondentName(e.target.value)}
                    placeholder="Name" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="text" value={respondentRole} onChange={(e) => setRespondentRole(e.target.value)}
                    placeholder="Role" className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                </div>
              )}
              <textarea value={textResponse} onChange={(e) => setTextResponse(e.target.value)}
                placeholder="Enter response..." rows={6} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none" />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..." rows={2} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm resize-none" />
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button onClick={handleReset} disabled={resetting}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-50">
                  <RotateCcw className="w-3 h-3" />Reset
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleSave()} disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
                  </button>
                  <button onClick={() => handleSave('completed')} disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-nxsys-500 text-white rounded hover:bg-nxsys-600 disabled:opacity-50">
                    <CheckCircle className="w-3 h-3" />Complete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Audio Tab */}
          {activeTab === 'audio' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{audioCount > 0 ? `${audioCount} recording${audioCount > 1 ? 's' : ''}` : 'No recordings'}</span>
                {!isRecording ? (
                  <button onClick={startRecording} disabled={processingAudio}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50">
                    <Mic className="w-3.5 h-3.5" />Record
                  </button>
                ) : (
                  <button onClick={stopRecording} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">
                    <Square className="w-3.5 h-3.5" />Stop ({formatTime(recordingTime)})
                  </button>
                )}
              </div>

              {/* Auto-process hint */}
              {!isRecording && !processingAudio && audioCount === 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                  <Mic className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                  <p className="text-sm text-purple-700 font-medium">Click Record to capture audio</p>
                  <p className="text-xs text-purple-600 mt-1">Recording will auto-transcribe and update observations</p>
                </div>
              )}

              {isRecording && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm text-red-700 font-mono font-medium">{formatTime(recordingTime)}</span>
                  <div className="flex-1 h-3 bg-red-200 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 transition-all" style={{ width: `${audioLevel}%` }} />
                  </div>
                  <span className="text-xs text-red-600">Recording...</span>
                </div>
              )}

              {processingAudio && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                    <span className="text-sm text-purple-700">Processing recording...</span>
                  </div>
                  <p className="text-xs text-purple-600 mt-1">Check the Observation tab for progress</p>
                </div>
              )}
              {question.audioRecordings?.map((audio) => (
                <div key={audio.id} className="border border-gray-200 rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <audio src={`/${audio.file_path}`} controls className="h-8 flex-1" preload="none" />
                    <span className="text-xs text-gray-500">{formatTime(audio.duration_seconds || 0)}</span>
                    <button onClick={() => handleTranscribe(audio.id)} disabled={transcribingId === audio.id}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50">
                      {transcribingId === audio.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}Transcribe
                    </button>
                    <button onClick={() => handleDeleteAudio(audio.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {audio.transcription && (
                    <div className="bg-gray-50 rounded p-2">
                      <button onClick={() => toggleTranscription(audio.id)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 w-full text-left">
                        {expandedTranscriptions[audio.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <span className="font-medium">Transcript</span>
                        {!expandedTranscriptions[audio.id] && <span className="text-gray-400 truncate flex-1 ml-1">{truncateText(audio.transcription)}</span>}
                      </button>
                      {expandedTranscriptions[audio.id] && <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">{audio.transcription}</p>}
                    </div>
                  )}
                </div>
              ))}
              {audioCount === 0 && !isRecording && (
                <div className="text-center py-6 text-gray-400">
                  <Mic className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click "Record" to capture audio</p>
                </div>
              )}
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'docs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{docCount > 0 ? `${docCount} document${docCount > 1 ? 's' : ''}` : 'No documents'}</span>
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif" />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
                  {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}Upload
                </button>
              </div>
              {question.documents?.length > 0 ? (
                <div className="space-y-2">
                  {question.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <File className="w-5 h-5 text-blue-500 shrink-0" />
                      <span className="flex-1 text-sm text-gray-700 truncate">{doc.original_name}</span>
                      <a href={`/${doc.file_path}`} download={doc.original_name} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Download className="w-4 h-4" /></a>
                      <button onClick={() => handleDeleteDocument(doc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click "Upload" to add documents</p>
                </div>
              )}
            </div>
          )}

          {/* Observation Tab - Checklist */}
          {activeTab === 'observation' && (
            <div className="space-y-4">
              {/* Header with Record, Generate Checklist, and Analyze buttons */}
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700">Initial Checklist</div>
                <div className="flex items-center gap-2">
                  {/* Generate Initial Checklist button */}
                  {observations.length === 0 ? (
                    <button onClick={() => handleGenerateInitialChecklist(false)} disabled={generatingInitialChecklist || processingAudio}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-50">
                      {generatingInitialChecklist ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
                      Generate Checklist
                    </button>
                  ) : (
                    <button onClick={() => handleGenerateInitialChecklist(true)} disabled={generatingInitialChecklist || processingAudio}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
                      title="Regenerate the initial checklist">
                      {generatingInitialChecklist ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    </button>
                  )}
                  {!isRecording ? (
                    <button onClick={startRecording} disabled={processingAudio || generatingInitialChecklist}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 shadow-sm">
                      <Mic className="w-4 h-4" />Record Response
                    </button>
                  ) : (
                    <button onClick={stopRecording}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm animate-pulse">
                      <Square className="w-4 h-4" />Stop ({formatTime(recordingTime)})
                    </button>
                  )}
                  <button onClick={handleCreateObservation} disabled={creatingObservation || processingAudio || generatingInitialChecklist || !question.answer}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 disabled:opacity-50">
                    {creatingObservation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {observations.length > 0 ? `Re-analyze` : 'Analyze'}
                  </button>
                </div>
              </div>

              {/* Recording indicator */}
              {isRecording && (
                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm text-red-700 font-mono font-medium">{formatTime(recordingTime)}</span>
                  <div className="flex-1 h-3 bg-red-200 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 transition-all" style={{ width: `${audioLevel}%` }} />
                  </div>
                  <span className="text-xs text-red-600">Recording... Click Stop when done</span>
                </div>
              )}

              {/* Auto-processing Progress Indicator */}
              {processingAudio && (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      processingStep === 'complete' ? 'bg-green-100' :
                      processingStep === 'error' ? 'bg-red-100' : 'bg-purple-100'
                    }`}>
                      {processingStep === 'complete' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : processingStep === 'error' ? (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      ) : (
                        <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">
                        {processingStep === 'saving' && 'Saving response...'}
                        {processingStep === 'uploading' && 'Uploading audio...'}
                        {processingStep === 'transcribing' && 'Transcribing audio...'}
                        {processingStep === 'analyzing' && 'Analyzing...'}
                        {processingStep === 'complete' && 'Processing complete!'}
                        {processingStep === 'error' && 'Processing failed'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {processingStep === 'saving' && 'Preparing your response'}
                        {processingStep === 'uploading' && 'Sending audio to server'}
                        {processingStep === 'transcribing' && 'Converting speech to text'}
                        {processingStep === 'analyzing' && 'Generating insights from your response'}
                        {processingStep === 'complete' && 'Your observation has been updated'}
                        {processingStep === 'error' && 'Please try again'}
                      </div>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        processingStep === 'complete' ? 'bg-green-500' :
                        processingStep === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                      }`}
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                  {/* Step indicators */}
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span className={processingProgress >= 10 ? 'text-purple-600' : ''}>Save</span>
                    <span className={processingProgress >= 25 ? 'text-purple-600' : ''}>Upload</span>
                    <span className={processingProgress >= 50 ? 'text-purple-600' : ''}>Transcribe</span>
                    <span className={processingProgress >= 75 ? 'text-purple-600' : ''}>Analyze</span>
                    <span className={processingProgress >= 100 ? 'text-green-600' : ''}>Done</span>
                  </div>
                </div>
              )}

              {/* Initial checklist generation indicator */}
              {generatingInitialChecklist && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 p-6">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-3">
                      <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-indigo-700">Researching question requirements...</p>
                    <p className="text-xs text-indigo-500 mt-1">Creating initial checklist of information to collect</p>
                    <div className="flex items-center gap-1 mt-3">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {observations.length > 0 && currentObs && (
                <div className="space-y-2">
                  {/* Stats Cards - Compact inline with progress */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setChecklistTab('missing')}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-semibold transition-all ${
                        checklistTab === 'missing'
                          ? 'bg-red-100 border-red-400 text-red-700 ring-1 ring-red-300'
                          : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      <Target className="w-3 h-3" />
                      <span>Missing</span>
                      <span className="font-bold">{totalMissing}</span>
                    </button>
                    <button
                      onClick={() => setChecklistTab('obtained')}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-semibold transition-all ${
                        checklistTab === 'obtained'
                          ? 'bg-green-100 border-green-400 text-green-700 ring-1 ring-green-300'
                          : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      <CheckCircle className="w-3 h-3" />
                      <span>Obtained</span>
                      <span className="font-bold">{totalObtained}</span>
                    </button>
                    {totalFindings > 0 && (
                      <button
                        onClick={() => setChecklistTab('findings')}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-semibold transition-all ${
                          checklistTab === 'findings'
                            ? 'bg-purple-100 border-purple-400 text-purple-700 ring-1 ring-purple-300'
                            : 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Findings</span>
                        <span className="font-bold">{totalFindings}</span>
                      </button>
                    )}
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500 rounded-full"
                          style={{ width: `${completionPercent}%` }} />
                      </div>
                      <span className="text-xs font-bold text-blue-600">{completionPercent}%</span>
                    </div>
                  </div>


                  {/* Tabbed Content - Obtained or Missing */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Obtained Tab Content */}
                    {checklistTab === 'obtained' && (
                      <div>
                        <div className="flex items-center justify-between px-3 py-2 bg-green-50 border-b border-green-200">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-semibold text-green-800">Information Obtained</span>
                            <span className="px-2 py-0.5 bg-green-200 text-green-800 rounded-full text-xs font-bold">{totalObtained}</span>
                          </div>
                        </div>
                        {totalObtained > 0 ? (
                          <div>
                            {currentObs.obtained_info.map((item, idx) => (
                              <div key={idx} className="px-3 py-2 hover:bg-green-50/50 border-b border-gray-100 last:border-b-0">
                                <div className="flex items-start gap-2">
                                  <Check className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-900 font-medium">{item.item}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs text-gray-500">Source: {item.source}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                                        item.confidence === 'high' ? 'bg-green-100 text-green-700' :
                                        item.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                      }`}>{item.confidence}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-gray-400">
                            <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No information obtained yet</p>
                          </div>
                        )}

                      </div>
                    )}

                    {/* Missing Tab Content */}
                    {checklistTab === 'missing' && (
                      <div>
                        <div className="flex items-center justify-between px-3 py-2 bg-red-50 border-b border-red-200">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            <span className="text-sm font-semibold text-red-800">Information Missing</span>
                            <span className="px-2 py-0.5 bg-red-200 text-red-800 rounded-full text-xs font-bold">{totalMissing}</span>
                          </div>
                          {totalMissing > 0 && (
                            <button onClick={copyAllMissingQuestions}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-red-200 rounded hover:bg-red-50 font-medium"
                              title="Copy all follow-up questions">
                              {copiedQuestion === 'all' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                              Copy All
                            </button>
                          )}
                        </div>
                        {totalMissing > 0 ? (
                          <div>
                            {/* Critical Items */}
                            {criticalMissing.length > 0 && (
                              <div className="bg-red-50/50">
                                <div className="px-3 py-1.5 bg-red-100 border-b border-red-200">
                                  <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Critical ({criticalMissing.length})</span>
                                </div>
                                {criticalMissing.map((item, idx) => (
                                  <MissingItem key={`critical-${idx}`} item={item} idx={idx} copyToClipboard={copyToClipboard} copiedQuestion={copiedQuestion} />
                                ))}
                              </div>
                            )}
                            {/* Important Items */}
                            {importantMissing.length > 0 && (
                              <div className="bg-orange-50/30">
                                <div className="px-3 py-1.5 bg-orange-100 border-b border-orange-200">
                                  <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">Important ({importantMissing.length})</span>
                                </div>
                                {importantMissing.map((item, idx) => (
                                  <MissingItem key={`important-${idx}`} item={item} idx={idx} copyToClipboard={copyToClipboard} copiedQuestion={copiedQuestion} />
                                ))}
                              </div>
                            )}
                            {/* Nice to Have Items */}
                            {niceMissing.length > 0 && (
                              <div>
                                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200">
                                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Nice to Have ({niceMissing.length})</span>
                                </div>
                                {niceMissing.map((item, idx) => (
                                  <MissingItem key={`nice-${idx}`} item={item} idx={idx} copyToClipboard={copyToClipboard} copiedQuestion={copiedQuestion} />
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-6 text-center bg-gradient-to-br from-green-50 to-emerald-100">
                            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                              <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                            <p className="text-sm font-medium text-green-700">All information obtained!</p>
                            <p className="text-xs text-green-600 mt-1">This question is fully answered.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Additional Findings Tab Content */}
                    {checklistTab === 'findings' && (
                      <div>
                        <div className="flex items-center justify-between px-3 py-2 bg-purple-50 border-b border-purple-200">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-600" />
                            <span className="text-sm font-semibold text-purple-800">Additional Findings</span>
                            <span className="px-2 py-0.5 bg-purple-200 text-purple-800 rounded-full text-xs font-bold">{totalFindings}</span>
                          </div>
                        </div>
                        {totalFindings > 0 ? (
                          <div className="divide-y divide-gray-100">
                            {additionalFindings.map((finding, idx) => (
                              <div key={idx} className="px-3 py-2 hover:bg-purple-50/30">
                                <div className="flex items-start gap-2">
                                  <span className="shrink-0 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">{finding.topic}</span>
                                  <span className="text-xs text-gray-400">{finding.source}</span>
                                </div>
                                <p className="text-sm text-gray-900 mt-1">{finding.finding}</p>
                                {finding.relevance && (
                                  <p className="text-xs text-gray-500 mt-1 italic">SAP Relevance: {finding.relevance}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-gray-400">
                            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No additional findings captured yet</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-gray-400 text-right">
                    Generated: {new Date(currentObs.created_at).toLocaleString()}
                  </div>
                </div>
              )}

              {observations.length === 0 && question.answer && !generatingInitialChecklist && (
                <div className="text-center py-6 text-gray-400">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click "Analyze Response" to generate insights</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Missing Item Component
function MissingItem({ item, idx, copyToClipboard, copiedQuestion }) {
  const itemId = `${item.item}-${idx}`;
  return (
    <div className="px-3 py-2 hover:bg-white/50 border-b border-gray-100 last:border-b-0">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 font-medium">{item.item}</p>
          {item.suggested_question && (
            <div className="mt-1.5 flex items-start gap-2 p-2 bg-blue-50 rounded border border-blue-100">
              <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 flex-1">{item.suggested_question}</p>
              <button onClick={() => copyToClipboard(item.suggested_question, itemId)}
                className="p-1 hover:bg-blue-100 rounded shrink-0" title="Copy question">
                {copiedQuestion === itemId ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-blue-500" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuestionView;
