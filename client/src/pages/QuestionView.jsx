import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getQuestion,
  saveAnswer,
  uploadAudio,
  uploadDocument,
  deleteAudio,
  deleteDocument
} from '../services/api';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle,
  Circle,
  AlertTriangle,
  Mic,
  MicOff,
  Square,
  Play,
  Pause,
  Trash2,
  Upload,
  FileText,
  File,
  Download,
  Clock,
  User
} from 'lucide-react';

const entityColors = {
  ARDC: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  ENF: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  GF: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' }
};

function QuestionView() {
  const { sessionId, questionId } = useParams();
  const navigate = useNavigate();
  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Answer form state
  const [textResponse, setTextResponse] = useState('');
  const [respondentName, setRespondentName] = useState('');
  const [respondentRole, setRespondentRole] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('pending');

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Audio playback state
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const audioRef = useRef(null);

  // File upload state
  const fileInputRef = useRef(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    loadQuestion();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [questionId]);

  const loadQuestion = async () => {
    try {
      const response = await getQuestion(questionId);
      setQuestion(response.data);

      // Populate form with existing answer
      if (response.data.answer) {
        setTextResponse(response.data.answer.text_response || '');
        setRespondentName(response.data.answer.respondent_name || '');
        setRespondentRole(response.data.answer.respondent_role || '');
        setNotes(response.data.answer.notes || '');
        setStatus(response.data.answer.status || 'pending');
      }
    } catch (error) {
      console.error('Failed to load question:', error);
    } finally {
      setLoading(false);
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

      // If there's a new audio recording, upload it
      if (audioBlob && response.data.id) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('duration_seconds', Math.round(recordingTime));
        await uploadAudio(response.data.id, formData);
        setAudioBlob(null);
        setAudioUrl(null);
        setRecordingTime(0);
      }

      // Reload question to get updated data
      await loadQuestion();
    } catch (error) {
      console.error('Failed to save answer:', error);
      alert('Failed to save answer. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkComplete = () => handleSave('completed');

  // Audio Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const discardRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Audio Playback Functions
  const handlePlayAudio = (audioId, filePath) => {
    if (playingAudioId === audioId) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(`/${filePath}`);
      audioRef.current.onended = () => setPlayingAudioId(null);
      audioRef.current.play();
      setPlayingAudioId(audioId);
    }
  };

  const handleDeleteAudio = async (audioId) => {
    if (!confirm('Are you sure you want to delete this recording?')) return;
    try {
      await deleteAudio(audioId);
      await loadQuestion();
    } catch (error) {
      console.error('Failed to delete audio:', error);
    }
  };

  // Document Upload Functions
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // First ensure we have an answer
    if (!question.answer) {
      await handleSave();
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('document', file);

      const answerId = question.answer?.id;
      if (answerId) {
        await uploadDocument(answerId, formData);
        await loadQuestion();
      }
    } catch (error) {
      console.error('Failed to upload document:', error);
      alert('Failed to upload document. Please try again.');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await deleteDocument(docId);
      await loadQuestion();
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const getFileIcon = (mimeType) => {
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('word')) return '📝';
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return '📊';
    if (mimeType?.includes('image')) return '🖼️';
    return '📎';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rawabi-600"></div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Question not found</p>
        <Link to={`/session/${sessionId}`} className="text-rawabi-600 hover:underline mt-2 inline-block">
          Back to Session
        </Link>
      </div>
    );
  }

  const colors = entityColors[question.entity_code] || entityColors.ARDC;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <Link
          to={`/session/${sessionId}`}
          className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Session
        </Link>

        <div className="flex items-center space-x-2">
          {question.navigation?.previous && (
            <Link
              to={`/session/${sessionId}/question/${question.navigation.previous.id}`}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              title="Previous Question"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          {question.navigation?.next && (
            <Link
              to={`/session/${sessionId}/question/${question.navigation.next.id}`}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              title="Next Question"
            >
              <ChevronRight className="w-5 h-5" />
            </Link>
          )}
        </div>
      </div>

      {/* Question Card */}
      <div className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-6`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold ${colors.badge}`}>
              {question.question_number}
            </span>
            <div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${colors.badge}`}>
                {question.entity_code} - {question.entity_name}
              </span>
              <p className="text-sm text-gray-500 mt-1">{question.session_name}</p>
            </div>
          </div>

          {question.is_critical && (
            <div className="flex items-center px-3 py-1 bg-amber-100 text-amber-800 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Critical
            </div>
          )}
        </div>

        <h2 className="text-xl font-medium text-gray-900 leading-relaxed">
          {question.question_text}
        </h2>

        {question.category_name && (
          <p className="mt-3 text-sm text-gray-600">
            Category: <span className="font-medium">{question.category_name}</span>
          </p>
        )}
      </div>

      {/* Answer Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <FileText className="w-5 h-5 mr-2 text-rawabi-600" />
          Response
        </h3>

        {/* Respondent Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="w-4 h-4 inline mr-1" />
              Respondent Name
            </label>
            <input
              type="text"
              value={respondentName}
              onChange={(e) => setRespondentName(e.target.value)}
              placeholder="Enter name..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rawabi-500 focus:border-rawabi-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role / Position
            </label>
            <input
              type="text"
              value={respondentRole}
              onChange={(e) => setRespondentRole(e.target.value)}
              placeholder="e.g., Finance Manager"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rawabi-500 focus:border-rawabi-500"
            />
          </div>
        </div>

        {/* Text Response */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Text Response
          </label>
          <textarea
            value={textResponse}
            onChange={(e) => setTextResponse(e.target.value)}
            placeholder="Enter the response to this question..."
            rows={6}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rawabi-500 focus:border-rawabi-500 resize-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Additional Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes, follow-up items, or observations..."
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rawabi-500 focus:border-rawabi-500 resize-none"
          />
        </div>

        {/* Audio Recording Section */}
        <div className="border-t border-gray-100 pt-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
            <Mic className="w-4 h-4 mr-2 text-purple-600" />
            Audio Recordings
          </h4>

          {/* Recording Controls */}
          <div className="flex items-center space-x-4 mb-4">
            {!isRecording && !audioUrl && (
              <button
                onClick={startRecording}
                className="flex items-center px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
              >
                <Mic className="w-4 h-4 mr-2" />
                Start Recording
              </button>
            )}

            {isRecording && (
              <>
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 bg-red-500 rounded-full recording-pulse" />
                  <span className="text-red-600 font-medium">{formatTime(recordingTime)}</span>
                </div>
                <button
                  onClick={stopRecording}
                  className="flex items-center px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </button>
              </>
            )}

            {audioUrl && !isRecording && (
              <div className="flex items-center space-x-3 flex-1">
                <audio src={audioUrl} controls className="flex-1 h-10" />
                <span className="text-sm text-gray-500">{formatTime(recordingTime)}</span>
                <button
                  onClick={discardRecording}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Discard"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Existing Audio Recordings */}
          {question.audioRecordings?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-2">Saved Recordings:</p>
              {question.audioRecordings.map((audio) => (
                <div
                  key={audio.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handlePlayAudio(audio.id, audio.file_path)}
                      className="p-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                    >
                      {playingAudioId === audio.id ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        Recording {audio.id}
                      </p>
                      <p className="text-xs text-gray-500">
                        {audio.duration_seconds ? formatTime(audio.duration_seconds) : 'Unknown duration'} •{' '}
                        {new Date(audio.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteAudio(audio.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document Upload Section */}
        <div className="border-t border-gray-100 pt-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
            <File className="w-4 h-4 mr-2 text-blue-600" />
            Supporting Documents
          </h4>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="flex items-center px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-rawabi-500 hover:text-rawabi-600 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploadingFile ? 'Uploading...' : 'Upload Document'}
          </button>

          {/* Existing Documents */}
          {question.documents?.length > 0 && (
            <div className="mt-4 space-y-2">
              {question.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getFileIcon(doc.mime_type)}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-700">{doc.original_name}</p>
                      <p className="text-xs text-gray-500">
                        {(doc.file_size / 1024).toFixed(1)} KB •{' '}
                        {new Date(doc.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <a
                      href={`/${doc.file_path}`}
                      download={doc.original_name}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status and Save */}
        <div className="border-t border-gray-100 pt-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="radio"
                name="status"
                checked={status === 'pending'}
                onChange={() => setStatus('pending')}
                className="text-rawabi-600 focus:ring-rawabi-500"
              />
              <Circle className="w-4 h-4 text-gray-400" />
              <span>Pending</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="radio"
                name="status"
                checked={status === 'in_progress'}
                onChange={() => setStatus('in_progress')}
                className="text-rawabi-600 focus:ring-rawabi-500"
              />
              <Clock className="w-4 h-4 text-amber-500" />
              <span>In Progress</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="radio"
                name="status"
                checked={status === 'completed'}
                onChange={() => setStatus('completed')}
                className="text-rawabi-600 focus:ring-rawabi-500"
              />
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Completed</span>
            </label>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={handleMarkComplete}
              disabled={saving}
              className="flex items-center px-4 py-2 bg-rawabi-600 text-white rounded-lg hover:bg-rawabi-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark Complete
            </button>
          </div>
        </div>

        {/* Last Updated */}
        {question.answer?.updated_at && (
          <p className="text-xs text-gray-400 text-right">
            Last updated: {new Date(question.answer.updated_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Quick Navigation */}
      <div className="flex items-center justify-between">
        {question.navigation?.previous ? (
          <Link
            to={`/session/${sessionId}/question/${question.navigation.previous.id}`}
            className="flex items-center text-gray-600 hover:text-rawabi-600 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Question {question.navigation.previous.question_number}
          </Link>
        ) : (
          <div />
        )}

        {question.navigation?.next ? (
          <Link
            to={`/session/${sessionId}/question/${question.navigation.next.id}`}
            className="flex items-center text-gray-600 hover:text-rawabi-600 transition-colors"
          >
            Question {question.navigation.next.question_number}
            <ChevronRight className="w-5 h-5 ml-1" />
          </Link>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

export default QuestionView;
