import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getSession, getQuestions, getSessionProgress, updateSessionStatus } from '../services/api';
import {
  ChevronLeft,
  CheckCircle,
  Circle,
  AlertTriangle,
  Filter,
  Search,
  PlayCircle,
  Clock,
  FileText,
  Mic,
  Paperclip
} from 'lucide-react';

const entityColors = {
  ARDC: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  ENF: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  GF: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' }
};

function SessionView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    try {
      const [sessionRes, progressRes] = await Promise.all([
        getSession(sessionId),
        getSessionProgress(sessionId)
      ]);
      setSession(sessionRes.data);
      setProgress(progressRes.data);

      // Load all questions for the session
      const questionsRes = await getQuestions({ session_id: sessionId, limit: 300 });
      setQuestions(questionsRes.data.questions);

      // Auto-select first entity
      if (progressRes.data.length > 0 && !selectedEntity) {
        setSelectedEntity(progressRes.data[0].entity_id);
      }
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

  const filteredQuestions = questions.filter((q) => {
    if (selectedEntity && q.entity_id !== selectedEntity) return false;
    if (searchTerm && !q.question_text.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (statusFilter === 'answered' && q.answer_status !== 'completed') return false;
    if (statusFilter === 'pending' && q.answer_status === 'completed') return false;
    if (statusFilter === 'critical' && !q.is_critical) return false;
    return true;
  });

  // Group questions by category
  const questionsByCategory = filteredQuestions.reduce((acc, q) => {
    const cat = q.category_name || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(q);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rawabi-600"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Session not found</p>
        <Link to="/" className="text-rawabi-600 hover:underline mt-2 inline-block">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold text-rawabi-600">Session {session.session_number}</span>
              <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
            </div>
            <p className="text-sm text-gray-500 mt-1">{session.description}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={session.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rawabi-500 focus:border-rawabi-500"
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Entity Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {progress.map((entity) => {
          const colors = entityColors[entity.entity_code] || entityColors.ARDC;
          const percentage = entity.total_questions > 0
            ? Math.round((entity.answered_questions / entity.total_questions) * 100)
            : 0;
          const isSelected = selectedEntity === entity.entity_id;

          return (
            <button
              key={entity.entity_id}
              onClick={() => setSelectedEntity(entity.entity_id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? `${colors.bg} ${colors.border}`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-1 rounded text-xs font-bold ${colors.badge}`}>
                  {entity.entity_code}
                </span>
                <span className={`text-lg font-bold ${isSelected ? colors.text : 'text-gray-700'}`}>
                  {percentage}%
                </span>
              </div>
              <p className="font-medium text-gray-900 text-sm">{entity.entity_name}</p>
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isSelected ? 'bg-rawabi-500' : 'bg-gray-400'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {entity.answered_questions} / {entity.total_questions} answered
              </p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rawabi-500 focus:border-rawabi-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rawabi-500 focus:border-rawabi-500"
            >
              <option value="all">All Questions</option>
              <option value="pending">Pending</option>
              <option value="answered">Answered</option>
              <option value="critical">Critical Only</option>
            </select>
          </div>

          <button
            onClick={() => setSelectedEntity(null)}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              !selectedEntity
                ? 'bg-rawabi-100 text-rawabi-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Show All Entities
          </button>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-6">
        {Object.entries(questionsByCategory).map(([category, categoryQuestions]) => (
          <div key={category} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{category}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {categoryQuestions.filter((q) => q.answer_status === 'completed').length} / {categoryQuestions.length} answered
              </p>
            </div>

            <div className="divide-y divide-gray-100">
              {categoryQuestions.map((question) => {
                const colors = entityColors[question.entity_code] || entityColors.ARDC;

                return (
                  <Link
                    key={question.id}
                    to={`/session/${sessionId}/question/${question.id}`}
                    className="block px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${colors.badge}`}>
                          {question.question_number}
                        </span>
                        <div className="flex-1">
                          <p className={`text-gray-900 ${question.is_critical ? 'font-medium' : ''}`}>
                            {question.is_critical && (
                              <AlertTriangle className="inline w-4 h-4 text-amber-500 mr-1" />
                            )}
                            {question.question_text}
                          </p>
                          <div className="flex items-center space-x-3 mt-2 text-xs text-gray-500">
                            <span className={`px-2 py-0.5 rounded ${colors.badge}`}>
                              {question.entity_code}
                            </span>
                            {question.audio_count > 0 && (
                              <span className="flex items-center text-purple-600">
                                <Mic className="w-3 h-3 mr-1" />
                                {question.audio_count}
                              </span>
                            )}
                            {question.document_count > 0 && (
                              <span className="flex items-center text-blue-600">
                                <Paperclip className="w-3 h-3 mr-1" />
                                {question.document_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="ml-4 flex-shrink-0">
                        {question.answer_status === 'completed' ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : question.answer_status === 'in_progress' ? (
                          <PlayCircle className="w-5 h-5 text-amber-500" />
                        ) : (
                          <Circle className="w-5 h-5 text-gray-300" />
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {filteredQuestions.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No questions match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionView;
