import { useState, useEffect } from 'react';
import {
  getAllGeneratedQuestions,
  updateGeneratedQuestion,
  bulkUpdateQuestions,
  publishAllQuestions,
  regenerateQuestion
} from '../../services/adminApi';
import {
  Check,
  X,
  Edit3,
  RefreshCw,
  Upload,
  Loader2,
  CheckCircle2,
  Filter,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  published: 'bg-blue-100 text-blue-800'
};

const moduleColors = {
  FICO: 'bg-blue-100 text-blue-800',
  MM: 'bg-amber-100 text-amber-800',
  SD: 'bg-green-100 text-green-800',
  PP: 'bg-purple-100 text-purple-800',
  QM: 'bg-rose-100 text-rose-800',
  HR: 'bg-cyan-100 text-cyan-800',
  Integration: 'bg-indigo-100 text-indigo-800'
};

function QuestionReview({ generationStatus, onRefresh }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [regenerating, setRegenerating] = useState({});
  const [publishing, setPublishing] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      const response = await getAllGeneratedQuestions();
      setQuestions(response.data);
    } catch (error) {
      console.error('Failed to load questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await updateGeneratedQuestion(id, { status: 'approved' });
      setQuestions(prev => prev.map(q =>
        q.id === id ? { ...q, status: 'approved' } : q
      ));
    } catch (error) {
      console.error('Failed to approve question:', error);
    }
  };

  const handleReject = async (id) => {
    try {
      await updateGeneratedQuestion(id, { status: 'rejected' });
      setQuestions(prev => prev.map(q =>
        q.id === id ? { ...q, status: 'rejected' } : q
      ));
    } catch (error) {
      console.error('Failed to reject question:', error);
    }
  };

  const handleEdit = async (id) => {
    if (editingId === id) {
      try {
        await updateGeneratedQuestion(id, { question_text: editText });
        setQuestions(prev => prev.map(q =>
          q.id === id ? { ...q, question_text: editText } : q
        ));
        setEditingId(null);
        setEditText('');
      } catch (error) {
        console.error('Failed to edit question:', error);
      }
    } else {
      const q = questions.find(q => q.id === id);
      setEditingId(id);
      setEditText(q.question_text);
    }
  };

  const handleRegenerate = async (id) => {
    setRegenerating(prev => ({ ...prev, [id]: true }));
    try {
      const response = await regenerateQuestion(id);
      setQuestions(prev => prev.map(q =>
        q.id === id ? { ...q, ...response.data } : q
      ));
    } catch (error) {
      console.error('Failed to regenerate question:', error);
    } finally {
      setRegenerating(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkUpdateQuestions(selectedIds, 'approved');
      setQuestions(prev => prev.map(q =>
        selectedIds.includes(q.id) ? { ...q, status: 'approved' } : q
      ));
      setSelectedIds([]);
    } catch (error) {
      console.error('Failed to bulk approve:', error);
    }
  };

  const handlePublish = async () => {
    const approvedCount = questions.filter(q => q.status === 'approved').length;
    if (approvedCount === 0) {
      alert('No approved questions to publish');
      return;
    }
    if (!confirm(`Publish ${approvedCount} approved questions to production?`)) return;

    setPublishing(true);
    try {
      const response = await publishAllQuestions();
      alert(response.data.message);
      loadQuestions();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to publish:', error);
      alert('Failed to publish questions');
    } finally {
      setPublishing(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllPending = () => {
    const pendingIds = filteredQuestions.filter(q => q.status === 'pending').map(q => q.id);
    setSelectedIds(pendingIds);
  };

  // Get unique sessions for filter
  const sessions = [...new Map(questions.map(q => [q.session_id, { id: q.session_id, name: q.session_name, module: q.session_module }])).values()];

  const filteredQuestions = questions.filter(q => {
    if (filter !== 'all' && q.status !== filter) return false;
    if (sessionFilter !== 'all' && q.session_id !== parseInt(sessionFilter)) return false;
    return true;
  });

  const stats = {
    total: questions.length,
    pending: questions.filter(q => q.status === 'pending').length,
    approved: questions.filter(q => q.status === 'approved').length,
    rejected: questions.filter(q => q.status === 'rejected').length,
    published: questions.filter(q => q.status === 'published').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-nxsys-500" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Sparkles className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p>No generated questions yet</p>
        <p className="text-sm">Configure the workshop and click "Generate All Questions" to get started</p>
        {generationStatus === 'generating' && (
          <div className="flex items-center justify-center mt-4 text-nxsys-600">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span>Generation in progress...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats and Actions Bar */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
        <div className="flex items-center space-x-4 text-sm">
          <span className="text-gray-600">
            Total: <strong>{stats.total}</strong>
          </span>
          <span className="text-yellow-600">
            Pending: <strong>{stats.pending}</strong>
          </span>
          <span className="text-green-600">
            Approved: <strong>{stats.approved}</strong>
          </span>
          <span className="text-red-600">
            Rejected: <strong>{stats.rejected}</strong>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkApprove}
              className="flex items-center space-x-1 px-3 py-1.5 bg-green-500 text-white rounded-md text-sm hover:bg-green-600"
            >
              <Check className="w-4 h-4" />
              <span>Approve ({selectedIds.length})</span>
            </button>
          )}
          <button
            onClick={handlePublish}
            disabled={publishing || stats.approved === 0}
            className="flex items-center space-x-1 px-3 py-1.5 bg-nxsys-500 text-white rounded-md text-sm hover:bg-nxsys-600 disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>Publish All ({stats.approved})</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-nxsys-500 focus:border-nxsys-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-nxsys-500 focus:border-nxsys-500"
          >
            <option value="all">All Sessions</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.module})</option>
            ))}
          </select>
        </div>
        {stats.pending > 0 && (
          <button
            onClick={selectAllPending}
            className="text-sm text-nxsys-600 hover:underline"
          >
            Select all pending ({filteredQuestions.filter(q => q.status === 'pending').length})
          </button>
        )}
      </div>

      {/* Questions List */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {filteredQuestions.map((question) => (
          <div
            key={question.id}
            className={`border rounded-lg overflow-hidden transition-all ${
              selectedIds.includes(question.id) ? 'border-nxsys-400 bg-nxsys-50' : 'border-gray-200'
            }`}
          >
            <div className="flex items-start p-3 gap-3">
              {question.status === 'pending' && (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(question.id)}
                  onChange={() => toggleSelect(question.id)}
                  className="mt-1 rounded text-nxsys-500 focus:ring-nxsys-500"
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1 flex-wrap gap-1">
                  <span className="text-sm font-medium text-gray-500">
                    #{question.question_number}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[question.status]}`}>
                    {question.status}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${moduleColors[question.session_module]}`}>
                    {question.session_module}
                  </span>
                  {question.is_critical && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                      Critical
                    </span>
                  )}
                  {question.entity_code && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {question.entity_code}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {question.category_name}
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-1">{question.session_name}</p>

                {editingId === question.id ? (
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
                    autoFocus
                  />
                ) : (
                  <p className="text-gray-900">{question.question_text}</p>
                )}

                {question.ai_rationale && (
                  <button
                    onClick={() => setExpandedId(expandedId === question.id ? null : question.id)}
                    className="flex items-center text-xs text-gray-500 hover:text-gray-700 mt-1"
                  >
                    {expandedId === question.id ? (
                      <ChevronUp className="w-3 h-3 mr-1" />
                    ) : (
                      <ChevronDown className="w-3 h-3 mr-1" />
                    )}
                    Rationale
                  </button>
                )}
                {expandedId === question.id && question.ai_rationale && (
                  <p className="text-sm text-gray-500 mt-2 pl-3 border-l-2 border-gray-200">
                    {question.ai_rationale}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-1">
                {question.status !== 'published' && (
                  <>
                    <button
                      onClick={() => handleApprove(question.id)}
                      className={`p-1.5 rounded hover:bg-green-100 ${
                        question.status === 'approved' ? 'text-green-600' : 'text-gray-400'
                      }`}
                      title="Approve"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleReject(question.id)}
                      className={`p-1.5 rounded hover:bg-red-100 ${
                        question.status === 'rejected' ? 'text-red-600' : 'text-gray-400'
                      }`}
                      title="Reject"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleEdit(question.id)}
                      className={`p-1.5 rounded hover:bg-blue-100 ${
                        editingId === question.id ? 'text-nxsys-600' : 'text-gray-400'
                      }`}
                      title={editingId === question.id ? 'Save' : 'Edit'}
                    >
                      {editingId === question.id ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <Edit3 className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleRegenerate(question.id)}
                      disabled={regenerating[question.id]}
                      className="p-1.5 rounded hover:bg-purple-100 text-gray-400"
                      title="Regenerate"
                    >
                      {regenerating[question.id] ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-5 h-5" />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredQuestions.length === 0 && (
        <div className="text-center py-4 text-gray-500">
          No questions match the current filter
        </div>
      )}
    </div>
  );
}

export default QuestionReview;
