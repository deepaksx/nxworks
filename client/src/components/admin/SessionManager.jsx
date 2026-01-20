import { useState, useEffect } from 'react';
import {
  getAdminSessions,
  createSession,
  updateSession,
  deleteSession
} from '../../services/adminApi';
import {
  Calendar,
  Clock,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

const moduleOptions = ['FICO', 'MM', 'SD', 'PP', 'QM', 'HR', 'Integration'];

const moduleColors = {
  FICO: 'bg-blue-100 text-blue-800',
  MM: 'bg-amber-100 text-amber-800',
  SD: 'bg-green-100 text-green-800',
  PP: 'bg-purple-100 text-purple-800',
  QM: 'bg-rose-100 text-rose-800',
  HR: 'bg-cyan-100 text-cyan-800',
  Integration: 'bg-indigo-100 text-indigo-800'
};

function SessionManager({ onSessionsChange }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    module: 'FICO',
    lead_consultant: '',
    scheduled_date: '',
    start_time: '',
    end_time: '',
    duration: '2 hours',
    agenda: '',
    question_count: 30
  });

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await getAdminSessions();
      setSessions(response.data);
      if (onSessionsChange) onSessionsChange(response.data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      module: 'FICO',
      lead_consultant: '',
      scheduled_date: '',
      start_time: '',
      end_time: '',
      duration: '2 hours',
      agenda: '',
      question_count: 30
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (session) => {
    setFormData({
      name: session.name || '',
      description: session.description || '',
      module: session.module || 'FICO',
      lead_consultant: session.lead_consultant || '',
      scheduled_date: session.scheduled_date ? session.scheduled_date.split('T')[0] : '',
      start_time: session.start_time || '',
      end_time: session.end_time || '',
      duration: session.duration || '2 hours',
      agenda: session.agenda || '',
      question_count: session.question_count || 30
    });
    setEditingId(session.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.module) return;

    setSaving(true);
    try {
      if (editingId) {
        const response = await updateSession(editingId, formData);
        setSessions(prev => prev.map(s => s.id === editingId ? response.data : s));
      } else {
        const response = await createSession(formData);
        setSessions(prev => [...prev, response.data]);
      }
      resetForm();
      loadSessions();
    } catch (error) {
      console.error('Failed to save session:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this session? This will also delete all associated questions.')) return;

    try {
      await deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (onSessionsChange) onSessionsChange(sessions.filter(s => s.id !== id));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-nxsys-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <Calendar className="w-4 h-4" />
          <span>Schedule workshop sessions for question generation</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-1 px-3 py-1.5 bg-nxsys-500 text-white rounded-md text-sm hover:bg-nxsys-600"
        >
          <Plus className="w-4 h-4" />
          <span>Add Session</span>
        </button>
      </div>

      {/* Session Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border border-nxsys-200 bg-nxsys-50 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Finance & Controlling Discovery"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SAP Module *</label>
              <select
                value={formData.module}
                onChange={(e) => setFormData(prev => ({ ...prev, module: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              >
                {moduleOptions.map(mod => (
                  <option key={mod} value={mod}>{mod}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of session scope..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>

          <div className="grid grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"># Questions</label>
              <input
                type="number"
                value={formData.question_count}
                onChange={(e) => setFormData(prev => ({ ...prev, question_count: parseInt(e.target.value) || 30 }))}
                min={5}
                max={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lead Consultant</label>
              <input
                type="text"
                value={formData.lead_consultant}
                onChange={(e) => setFormData(prev => ({ ...prev, lead_consultant: e.target.value }))}
                placeholder="Name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Agenda</label>
            <textarea
              value={formData.agenda}
              onChange={(e) => setFormData(prev => ({ ...prev, agenda: e.target.value }))}
              placeholder="Detailed agenda for this session (used for question generation)..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center space-x-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              disabled={saving || !formData.name.trim()}
              className="flex items-center space-x-1 px-3 py-1.5 bg-nxsys-500 text-white rounded-md text-sm hover:bg-nxsys-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{editingId ? 'Update' : 'Create'} Session</span>
            </button>
          </div>
        </form>
      )}

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>No sessions scheduled yet</p>
          <p className="text-sm">Add sessions to generate questions for</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <div
              key={session.id}
              className="border border-gray-200 rounded-lg p-4 flex justify-between items-center hover:bg-gray-50"
            >
              <div className="flex items-center space-x-4">
                <div className="text-2xl font-bold text-nxsys-500 w-10">
                  {session.session_number}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium text-gray-900">{session.name}</h4>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${moduleColors[session.module]}`}>
                      {session.module}
                    </span>
                    {session.questions_generated ? (
                      <CheckCircle className="w-4 h-4 text-green-500" title="Questions generated" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-gray-300" title="No questions yet" />
                    )}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center space-x-3">
                    {session.scheduled_date && (
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(session.scheduled_date).toLocaleDateString()}</span>
                      </span>
                    )}
                    {session.start_time && (
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{session.start_time} - {session.end_time || '?'}</span>
                      </span>
                    )}
                    <span>
                      {session.total_questions || 0} questions
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleEdit(session)}
                  className="p-2 text-gray-400 hover:text-nxsys-600 hover:bg-nxsys-50 rounded"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(session.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SessionManager;
