import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getSession, getQuestions, getSessionProgress, updateSessionStatus, getParticipants, getSessionReportStatus, generateReport } from '../services/api';
import ParticipantsModal from '../components/ParticipantsModal';
import ChecklistModeView from '../components/ChecklistModeView';
import {
  ChevronLeft,
  CheckCircle,
  Circle,
  AlertTriangle,
  Search,
  PlayCircle,
  Clock,
  Mic,
  Paperclip,
  Users,
  FileText,
  Loader2,
  Sparkles,
  Download,
  Eye
} from 'lucide-react';

const entityColors = {
  ARDC: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  ENF: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  GF: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
  General: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-600' }
};

function SessionView() {
  const { workshopId, sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [progress, setProgress] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [reportStatus, setReportStatus] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    try {
      const [sessionRes, progressRes, participantsRes, reportStatusRes] = await Promise.all([
        getSession(sessionId),
        getSessionProgress(sessionId),
        getParticipants(sessionId),
        getSessionReportStatus(sessionId)
      ]);
      setSession(sessionRes.data);
      // Handle new progress response structure
      const progressData = progressRes.data.entities || progressRes.data;
      setProgress(progressData);
      setParticipants(participantsRes.data);
      setReportStatus(reportStatusRes.data);

      const questionsRes = await getQuestions({ session_id: sessionId, limit: 300 });
      setQuestions(questionsRes.data.questions);

      // Keep "all" as default - don't auto-select first entity

      // Auto-start session if not started (removed participants requirement)
      // if (sessionRes.data.status === 'not_started' && participantsRes.data.length === 0) {
      //   setShowParticipantsModal(true);
      // }
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status) => {
    try {
      await updateSessionStatus(sessionId, status);
      setSession({ ...session, status });
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleStartSession = async (updatedParticipants) => {
    setParticipants(updatedParticipants);
    setShowParticipantsModal(false);
    await handleStatusChange('in_progress');
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const response = await generateReport(sessionId);
      if (response.data.success) {
        navigate(`/workshop/${workshopId}/session/${sessionId}/report/${response.data.report.id}`);
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report: ' + (error.response?.data?.error || error.message));
    } finally {
      setGeneratingReport(false);
    }
  };

  const filteredQuestions = questions
    .filter((q) => {
      // Filter by entity: 'all' shows everything, null shows general questions, otherwise filter by entity_id
      if (selectedEntity !== 'all') {
        if (selectedEntity === null) {
          // Show only general questions (no entity)
          if (q.entity_id !== null) return false;
        } else {
          // Show only questions for selected entity
          if (q.entity_id !== selectedEntity) return false;
        }
      }
      if (searchTerm && !q.question_text.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (statusFilter === 'answered' && q.answer_status !== 'completed') return false;
      if (statusFilter === 'pending' && q.answer_status === 'completed') return false;
      if (statusFilter === 'critical' && !q.is_critical) return false;
      return true;
    })
    .sort((a, b) => a.question_number - b.question_number); // Sequential order

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nxsys-500"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Session not found</p>
        <Link to={`/workshop/${workshopId}`} className="text-nxsys-500 hover:underline mt-2 inline-block">Back to Workshop</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showParticipantsModal && (
        <ParticipantsModal
          sessionId={sessionId}
          sessionName={session.name}
          onClose={() => setShowParticipantsModal(false)}
          onStartSession={handleStartSession}
        />
      )}

      {/* Checklist Mode View - has its own integrated header */}
      {session.checklist_mode ? (
        <ChecklistModeView
          workshopId={workshopId}
          sessionId={sessionId}
          session={session}
          participants={participants}
          onShowParticipants={() => setShowParticipantsModal(true)}
          onStatusChange={handleStatusChange}
        />
      ) : (
      <>
      {/* Compact Header - only shown for non-checklist mode */}
      <div className="flex items-center justify-between bg-white rounded-lg p-3 shadow-sm border border-gray-100">
        <div className="flex items-center space-x-3">
          <Link to={`/workshop/${workshopId}`} className="p-1 hover:bg-gray-100 rounded transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <span className="text-lg font-bold text-nxsys-500">S{session.session_number}</span>
          <h1 className="font-semibold text-gray-900">{session.name}</h1>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowParticipantsModal(true)}
            className="flex items-center px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            <Users className="w-4 h-4 mr-1 text-gray-600" />
            {participants.length}
          </button>
          <select
            value={session.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <>
      {/* Entity Tabs + Filters */}
      <div className="flex items-center justify-between bg-white rounded-lg p-2 shadow-sm border border-gray-100">
        <div className="flex items-center space-x-1">
          {/* All tab first */}
          <button
            onClick={() => setSelectedEntity('all')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              selectedEntity === 'all' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All ({questions.length})
          </button>
          {/* Entity tabs */}
          {progress.map((entity) => {
            const colors = entityColors[entity.entity_code] || { badge: 'bg-gray-100 text-gray-800' };
            const isSelected = selectedEntity === entity.entity_id;

            return (
              <button
                key={entity.entity_id || 'general'}
                onClick={() => setSelectedEntity(entity.entity_id)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  isSelected ? `${colors.badge}` : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {entity.entity_code} ({entity.answered_questions}/{entity.total_questions})
              </button>
            );
          })}
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 border border-gray-300 rounded text-sm w-40"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="answered">Answered</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Compact Questions Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Question</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-16">Entity</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">Files</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredQuestions.map((question) => {
              const entityCode = question.entity_code || 'General';
              const colors = entityColors[entityCode] || entityColors.General;

              return (
                <tr key={question.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${colors.badge}`}>
                      {question.question_number}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/workshop/${workshopId}/session/${sessionId}/question/${question.id}`}
                      className="hover:text-nxsys-500 block"
                    >
                      <span className={question.is_critical ? 'font-medium' : ''}>
                        {question.is_critical && <AlertTriangle className="inline w-3 h-3 text-amber-500 mr-1" />}
                        {question.question_text.length > 100
                          ? question.question_text.substring(0, 100) + '...'
                          : question.question_text}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {entityCode && (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${colors.badge}`}>
                        {entityCode}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center space-x-2 text-xs">
                      {question.audio_count > 0 && (
                        <span className="flex items-center text-purple-600">
                          <Mic className="w-3 h-3 mr-0.5" />{question.audio_count}
                        </span>
                      )}
                      {question.document_count > 0 && (
                        <span className="flex items-center text-blue-600">
                          <Paperclip className="w-3 h-3 mr-0.5" />{question.document_count}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {question.answer_status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : question.answer_status === 'in_progress' ? (
                      <PlayCircle className="w-4 h-4 text-amber-500" />
                    ) : question.answer_status === 'pending' ? (
                      <Clock className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredQuestions.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">No questions match your filters</div>
        )}
      </div>

      {/* Report Generation Card */}
      {reportStatus && (
        <div className={`rounded-lg border p-4 ${
          reportStatus.is_complete
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                reportStatus.is_complete ? 'bg-green-100' : 'bg-gray-200'
              }`}>
                <FileText className={`w-6 h-6 ${reportStatus.is_complete ? 'text-green-600' : 'text-gray-500'}`} />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Session Report</h3>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span>{reportStatus.completed_questions} of {reportStatus.total_questions} questions completed</span>
                  <span className="text-gray-300">|</span>
                  <span className={reportStatus.is_complete ? 'text-green-600 font-medium' : ''}>
                    {reportStatus.completion_percent}% complete
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-48 h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      reportStatus.is_complete ? 'bg-green-500' : 'bg-amber-400'
                    }`}
                    style={{ width: `${reportStatus.completion_percent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {reportStatus.existing_report ? (
                <>
                  <Link
                    to={`/workshop/${workshopId}/session/${sessionId}/report/${reportStatus.existing_report.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    <Eye className="w-4 h-4" />
                    View Report
                  </Link>
                  <button
                    onClick={handleGenerateReport}
                    disabled={generatingReport || !reportStatus.is_complete}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-nxsys-500 text-white rounded-lg hover:bg-nxsys-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generatingReport ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> Regenerate</>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGenerateReport}
                  disabled={generatingReport || !reportStatus.is_complete}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg ${
                    reportStatus.is_complete
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  } disabled:opacity-50`}
                >
                  {generatingReport ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generate Report</>
                  )}
                </button>
              )}
            </div>
          </div>

          {!reportStatus.is_complete && (
            <p className="text-xs text-gray-500 mt-3">
              Complete all questions to generate the session report. Mark each question as "Completed" when finished.
            </p>
          )}
        </div>
      )}
      </>
      </>
      )}
    </div>
  );
}

export default SessionView;
