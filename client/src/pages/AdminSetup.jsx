import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getWorkshopConfig,
  saveWorkshopConfig,
  getEntities,
  createEntity,
  updateEntity,
  deleteEntity,
  getAdminSessions,
  createSession,
  updateSession,
  deleteSession,
  generateSessionQuestions
} from '../services/adminApi';
import {
  Settings,
  Building2,
  Calendar,
  Sparkles,
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  CheckCircle,
  X,
  Edit3,
  Search
} from 'lucide-react';

const moduleOptions = ['FICO', 'MM', 'SD', 'PP', 'QM', 'HR', 'Integration'];

const industryOptions = [
  'Food & Beverage', 'Dairy Products', 'Animal Feed & Agriculture',
  'Manufacturing', 'Distribution & Logistics', 'Retail', 'Consumer Goods',
  'Healthcare', 'Technology', 'Financial Services', 'Energy & Utilities'
];

const sectorOptions = [
  'FMCG', 'Agriculture', 'Food Processing', 'Cold Chain Logistics',
  'Retail Distribution', 'B2B Industrial', 'B2C Consumer', 'Government'
];

function AdminSetup() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, sessionName: '' });
  const [showCustomInstructionsModal, setShowCustomInstructionsModal] = useState(false);
  const [tempCustomInstructions, setTempCustomInstructions] = useState('');

  // Workshop Config
  const [config, setConfig] = useState({
    workshop_name: 'S/4HANA Pre-Discovery Workshop',
    client_name: '',
    industry_context: '',
    custom_instructions: '',
    questions_per_session: 30
  });

  // Entities
  const [entities, setEntities] = useState([]);
  const [newEntity, setNewEntity] = useState({ code: '', name: '', description: '', industry: '', sector: '', business_context: '' });

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [newSession, setNewSession] = useState({ name: '', module: 'FICO', description: '', agenda: '', question_count: 30 });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [configRes, entitiesRes, sessionsRes] = await Promise.all([
        getWorkshopConfig(),
        getEntities(),
        getAdminSessions()
      ]);

      setConfig(configRes.data);
      setEntities(entitiesRes.data);
      setSessions(sessionsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await saveWorkshopConfig(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (sessions.length === 0) {
      alert('Please add at least one session before generating questions.');
      return;
    }
    if (!confirm(`Generate questions for all ${sessions.length} sessions? This may take a few minutes.`)) return;

    setGenerating(true);
    setGenerationProgress({ current: 0, total: sessions.length, sessionName: '' });

    let successCount = 0;
    let totalQuestions = 0;

    try {
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        setGenerationProgress({
          current: i + 1,
          total: sessions.length,
          sessionName: session.name
        });

        try {
          const response = await generateSessionQuestions(session.id);
          successCount++;
          totalQuestions += response.data.count || 0;
        } catch (error) {
          console.error(`Failed to generate for session ${session.name}:`, error);
        }
      }

      setGenerationProgress({ current: sessions.length, total: sessions.length, sessionName: 'Complete!' });
      alert(`Generated ${totalQuestions} questions across ${successCount} sessions.`);
      loadAllData();
    } catch (error) {
      console.error('Failed to generate:', error);
      alert('Failed to generate questions: ' + (error.response?.data?.error || error.message));
    } finally {
      setTimeout(() => {
        setGenerating(false);
        setGenerationProgress({ current: 0, total: 0, sessionName: '' });
      }, 1000);
    }
  };

  // Entity handlers
  const handleAddEntity = async () => {
    if (!newEntity.code.trim() || !newEntity.name.trim()) return;
    try {
      const response = await createEntity(newEntity);
      setEntities([...entities, response.data]);
      setNewEntity({ code: '', name: '', description: '', industry: '', sector: '', business_context: '' });
    } catch (error) {
      alert('Failed to add entity: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUpdateEntity = async (id, field, value) => {
    try {
      const entity = entities.find(e => e.id === id);
      const updated = { ...entity, [field]: value };
      await updateEntity(id, updated);
      setEntities(entities.map(e => e.id === id ? updated : e));
    } catch (error) {
      console.error('Failed to update entity:', error);
    }
  };

  const handleDeleteEntity = async (id) => {
    if (!confirm('Delete this entity?')) return;
    try {
      await deleteEntity(id);
      setEntities(entities.filter(e => e.id !== id));
    } catch (error) {
      alert('Failed to delete entity');
    }
  };

  // Session handlers
  const handleAddSession = async () => {
    if (!newSession.name.trim()) return;
    try {
      const response = await createSession(newSession);
      setSessions([...sessions, response.data]);
      setNewSession({ name: '', module: 'FICO', description: '', agenda: '', question_count: 30 });
    } catch (error) {
      alert('Failed to add session: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUpdateSession = async (id, field, value) => {
    try {
      const session = sessions.find(s => s.id === id);
      const updated = { ...session, [field]: value };
      await updateSession(id, updated);
      setSessions(sessions.map(s => s.id === id ? updated : s));
    } catch (error) {
      console.error('Failed to update session:', error);
    }
  };

  const handleDeleteSession = async (id) => {
    if (!confirm('Delete this session and its questions?')) return;
    try {
      await deleteSession(id);
      setSessions(sessions.filter(s => s.id !== id));
    } catch (error) {
      alert('Failed to delete session');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-nxsys-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* Generation Progress Modal */}
      {generating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <Sparkles className="w-12 h-12 text-purple-500 mx-auto mb-4 animate-pulse" />
              <h3 className="text-xl font-bold text-gray-900">Generating Questions</h3>
              <p className="text-gray-500 mt-1">Please wait while your questions are being generated...</p>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Session {generationProgress.current} of {generationProgress.total}</span>
                <span>{Math.round((generationProgress.current / generationProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-purple-500 to-nxsys-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                />
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 truncate">
                {generationProgress.sessionName || 'Initializing...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Custom Instructions Modal */}
      {showCustomInstructionsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center">
                <Edit3 className="w-5 h-5 text-nxsys-500 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Custom Instructions</h3>
              </div>
              <button
                onClick={() => setShowCustomInstructionsModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-600 mb-3">
                Add specific instructions or context that will guide the AI when generating discovery questions.
                This can include company-specific terminology, focus areas, or special requirements.
              </p>
              <textarea
                value={tempCustomInstructions}
                onChange={(e) => setTempCustomInstructions(e.target.value)}
                placeholder="Enter custom instructions here...

Examples:
- Focus on VAT compliance for UAE operations
- Include questions about multi-currency handling
- Emphasize cold chain logistics requirements
- Consider integration with existing Oracle ERP"
                rows={15}
                className="w-full px-3 py-2 border rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500 font-mono"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowCustomInstructionsModal(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfig({ ...config, custom_instructions: tempCustomInstructions });
                  setShowCustomInstructionsModal(false);
                }}
                className="px-4 py-2 text-sm bg-nxsys-500 text-white rounded-lg hover:bg-nxsys-600"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 bg-gray-50 py-4 z-10 border-b">
        <div className="flex items-center space-x-4">
          <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Workshop Setup</h1>
            <p className="text-sm text-gray-500">Configure everything, then generate questions</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-nxsys-500 text-white rounded-lg hover:bg-nxsys-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved!' : 'Save Config'}</span>
          </button>
          <button
            onClick={handleGenerateQuestions}
            disabled={generating || sessions.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-nxsys-500 text-white rounded-lg hover:from-purple-600 hover:to-nxsys-600 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{generating ? 'Generating...' : 'Generate Questions'}</span>
          </button>
        </div>
      </div>

      {/* Section 1: Workshop Configuration */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Settings className="w-5 h-5 mr-2 text-nxsys-500" />
          Workshop Configuration
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workshop Name</label>
            <input
              type="text"
              value={config.workshop_name || ''}
              onChange={(e) => setConfig({ ...config, workshop_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
            <input
              type="text"
              value={config.client_name || ''}
              onChange={(e) => setConfig({ ...config, client_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Questions/Session</label>
            <input
              type="number"
              value={config.questions_per_session || 30}
              onChange={(e) => setConfig({ ...config, questions_per_session: parseInt(e.target.value) || 30 })}
              min={5}
              max={100}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry Context</label>
          <textarea
            value={config.industry_context || ''}
            onChange={(e) => setConfig({ ...config, industry_context: e.target.value })}
            placeholder="Describe the client's industry, business model, and context..."
            rows={3}
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Custom Instructions</label>
            <button
              onClick={() => {
                setTempCustomInstructions(config.custom_instructions || '');
                setShowCustomInstructionsModal(true);
              }}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
            >
              <Search className="w-3.5 h-3.5 mr-1" />
              Research
            </button>
          </div>
          <div
            onClick={() => {
              setTempCustomInstructions(config.custom_instructions || '');
              setShowCustomInstructionsModal(true);
            }}
            className="w-full px-3 py-2 border rounded-md text-sm bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-nxsys-300 transition-colors min-h-[60px]"
          >
            {config.custom_instructions ? (
              <span className="text-gray-800 whitespace-pre-wrap line-clamp-2">{config.custom_instructions}</span>
            ) : (
              <span className="text-gray-400 italic">Click to add custom instructions for question generation...</span>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Business Entities */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Building2 className="w-5 h-5 mr-2 text-nxsys-500" />
          Business Entities
          <span className="ml-2 text-sm font-normal text-gray-500">({entities.length})</span>
        </h2>

        {/* Entity List */}
        {entities.map(entity => (
          <div key={entity.id} className="border rounded-lg p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{entity.code} - {entity.name}</span>
              <button onClick={() => handleDeleteEntity(entity.id)} className="text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={entity.industry || ''}
                onChange={(e) => handleUpdateEntity(entity.id, 'industry', e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value="">Industry</option>
                {industryOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select
                value={entity.sector || ''}
                onChange={(e) => handleUpdateEntity(entity.id, 'sector', e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value="">Sector</option>
                {sectorOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <input
                type="text"
                value={entity.business_context || ''}
                onChange={(e) => handleUpdateEntity(entity.id, 'business_context', e.target.value)}
                placeholder="Business context..."
                className="px-2 py-1 border rounded text-sm"
              />
            </div>
          </div>
        ))}

        {/* Add New Entity */}
        <div className="flex items-center space-x-2 mt-3">
          <input
            type="text"
            value={newEntity.code}
            onChange={(e) => setNewEntity({ ...newEntity, code: e.target.value.toUpperCase() })}
            placeholder="Code"
            maxLength={10}
            className="w-20 px-2 py-1.5 border rounded text-sm"
          />
          <input
            type="text"
            value={newEntity.name}
            onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
            placeholder="Entity Name"
            className="flex-1 px-2 py-1.5 border rounded text-sm"
          />
          <button
            onClick={handleAddEntity}
            disabled={!newEntity.code.trim() || !newEntity.name.trim()}
            className="flex items-center px-3 py-1.5 bg-nxsys-500 text-white rounded text-sm hover:bg-nxsys-600 disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </button>
        </div>
      </section>

      {/* Section 3: Workshop Sessions */}
      <section className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Calendar className="w-5 h-5 mr-2 text-nxsys-500" />
          Workshop Sessions
          <span className="ml-2 text-sm font-normal text-gray-500">({sessions.length})</span>
        </h2>

        {/* Sessions List */}
        <div className="space-y-3 mb-4">
          {sessions.map((session, idx) => (
            <div key={session.id} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <span className="w-8 h-8 flex items-center justify-center bg-nxsys-500 text-white rounded font-bold text-sm">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={session.name}
                    onChange={(e) => handleUpdateSession(session.id, 'name', e.target.value)}
                    className="font-medium px-2 py-1 border rounded text-sm w-64"
                  />
                  <select
                    value={session.module}
                    onChange={(e) => handleUpdateSession(session.id, 'module', e.target.value)}
                    className="px-2 py-1 border rounded text-sm"
                  >
                    {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input
                    type="number"
                    value={session.question_count || 30}
                    onChange={(e) => handleUpdateSession(session.id, 'question_count', parseInt(e.target.value) || 30)}
                    min={5}
                    max={100}
                    className="w-16 px-2 py-1 border rounded text-sm"
                    title="Questions"
                  />
                  <span className="text-xs text-gray-500">questions</span>
                </div>
                <button onClick={() => handleDeleteSession(session.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={session.agenda || ''}
                onChange={(e) => handleUpdateSession(session.id, 'agenda', e.target.value)}
                placeholder="Session agenda/focus areas for question generation..."
                rows={2}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </div>
          ))}
        </div>

        {/* Add New Session */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              value={newSession.name}
              onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
              placeholder="Session Name (e.g., Finance & Controlling)"
              className="flex-1 px-2 py-1.5 border rounded text-sm"
            />
            <select
              value={newSession.module}
              onChange={(e) => setNewSession({ ...newSession, module: e.target.value })}
              className="px-2 py-1.5 border rounded text-sm"
            >
              {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input
              type="number"
              value={newSession.question_count}
              onChange={(e) => setNewSession({ ...newSession, question_count: parseInt(e.target.value) || 30 })}
              min={5}
              max={100}
              className="w-16 px-2 py-1.5 border rounded text-sm"
              placeholder="#"
            />
            <button
              onClick={handleAddSession}
              disabled={!newSession.name.trim()}
              className="flex items-center px-3 py-1.5 bg-nxsys-500 text-white rounded text-sm hover:bg-nxsys-600 disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Session
            </button>
          </div>
        </div>
      </section>

      {/* Summary & Generate */}
      <section className="bg-gradient-to-r from-purple-50 to-nxsys-50 rounded-lg border-2 border-nxsys-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Ready to Generate?</h3>
            <p className="text-sm text-gray-600">
              {entities.length} entities, {sessions.length} sessions configured
            </p>
          </div>
          <button
            onClick={handleGenerateQuestions}
            disabled={generating || sessions.length === 0}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-nxsys-500 text-white rounded-lg hover:from-purple-600 hover:to-nxsys-600 disabled:opacity-50 font-medium"
          >
            {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            <span>{generating ? 'Generating Questions...' : 'Generate All Questions'}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

export default AdminSetup;
