import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getWorkshop,
  updateWorkshop,
  getEntities,
  createEntity,
  updateEntity,
  deleteEntity,
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  generateSessionQuestions
} from '../services/workshopApi';
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
  Globe,
  Search,
  X,
  List,
  Edit3,
  Share2,
  Copy,
  RefreshCw,
  ExternalLink,
  FileText
} from 'lucide-react';
import axios from 'axios';
import CriticalConfirmDialog from '../components/CriticalConfirmDialog';
import {
  enableSharing,
  disableSharing,
  getShareStatus,
  regeneratePassword
} from '../services/shareApi';

const moduleOptions = [
  // Finance & Controlling
  'FI - Financial Accounting',
  'CO - Controlling',
  'FICO - Finance & Controlling',
  'TR - Treasury',
  'RE - Real Estate',
  // Logistics & Supply Chain
  'MM - Materials Management',
  'SD - Sales & Distribution',
  'PP - Production Planning',
  'QM - Quality Management',
  'PM - Plant Maintenance',
  'PS - Project System',
  'WM - Warehouse Management',
  'EWM - Extended Warehouse Management',
  'TM - Transportation Management',
  'LE - Logistics Execution',
  // Human Resources
  'HCM - Human Capital Management',
  'SF - SuccessFactors',
  'Payroll',
  // Analytics & Planning
  'BW - Business Warehouse',
  'BPC - Business Planning & Consolidation',
  'IBP - Integrated Business Planning',
  'SAC - SAP Analytics Cloud',
  // Master Data & Governance
  'MDG - Master Data Governance',
  'GRC - Governance Risk Compliance',
  // Procurement & Sourcing
  'SRM - Supplier Relationship Management',
  'Ariba',
  // Customer & Sales
  'CRM - Customer Relationship Management',
  'C4C - Cloud for Customer',
  // Technical
  'Basis - Technical Administration',
  'ABAP - Development',
  'Fiori - UI/UX',
  'Integration - Interfaces & APIs',
  // Industry Solutions
  'IS-Retail',
  'IS-Oil & Gas',
  'IS-Utilities',
  // Other
  'General',
  'Cross-Functional'
];

const industryOptions = [
  'Food & Beverage', 'Dairy Products', 'Animal Feed & Agriculture',
  'Manufacturing', 'Distribution & Logistics', 'Retail', 'Consumer Goods',
  'Healthcare', 'Technology', 'Financial Services', 'Energy & Utilities'
];

const sectorOptions = [
  'FMCG', 'Agriculture', 'Food Processing', 'Cold Chain Logistics',
  'Retail Distribution', 'B2B Industrial', 'B2C Consumer', 'Government'
];

function WorkshopSetup() {
  const { workshopId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [researching, setResearching] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({
    sessionCurrent: 0,
    sessionTotal: 0,
    sessionName: '',
    phase: '',
    message: '',
    progress: 0,
    checklistCurrent: 0,
    checklistTotal: 0
  });

  // Workshop Config
  const [workshop, setWorkshop] = useState({
    name: '',
    client_name: '',
    client_website: '',
    industry_context: '',
    custom_instructions: '',
    questions_per_session: 30
  });

  // Entities
  const [entities, setEntities] = useState([]);
  const [newEntity, setNewEntity] = useState({ code: '', name: '', description: '', industry: '', sector: '', business_context: '' });

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [newSession, setNewSession] = useState({ name: '', module: 'FICO - Finance & Controlling', description: '', agenda: '', question_count: 30, topics: '' });

  // Topics modal state
  const [topicsModalOpen, setTopicsModalOpen] = useState(false);
  const [editingTopicsSession, setEditingTopicsSession] = useState(null);
  const [editingTopicsValue, setEditingTopicsValue] = useState('');

  // Custom Instructions modal state
  const [customInstructionsModalOpen, setCustomInstructionsModalOpen] = useState(false);
  const [editingCustomInstructions, setEditingCustomInstructions] = useState('');

  // Critical confirmation dialog state
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showSimpleGenerateConfirm, setShowSimpleGenerateConfirm] = useState(false);

  // Direct Checklist Mode state
  const [generatingChecklist, setGeneratingChecklist] = useState(false);
  const [showChecklistConfirm, setShowChecklistConfirm] = useState(false);
  const [checklistProgress, setChecklistProgress] = useState({
    sessionCurrent: 0,
    sessionTotal: 0,
    sessionName: '',
    phase: '',
    message: '',
    progress: 0
  });

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSession, setShareSession] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareData, setShareData] = useState({
    enabled: false,
    url: '',
    username: '',
    password: '',
    token: ''
  });
  const [copySuccess, setCopySuccess] = useState('');

  // Transcript generation state
  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const [transcriptResult, setTranscriptResult] = useState(null);

  // Check if any session has existing questions
  const hasExistingQuestions = sessions.some(s => s.questions_generated);
  const hasExistingChecklists = sessions.some(s => s.checklist_generated);

  useEffect(() => {
    loadAllData();
  }, [workshopId]);

  const loadAllData = async () => {
    try {
      const [workshopRes, entitiesRes, sessionsRes] = await Promise.all([
        getWorkshop(workshopId),
        getEntities(workshopId),
        getSessions(workshopId)
      ]);

      setWorkshop(workshopRes.data);
      setEntities(entitiesRes.data);
      setSessions(sessionsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWorkshop = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateWorkshop(workshopId, workshop);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save workshop configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleResearchClient = async () => {
    if (!workshop.client_website) {
      alert('Please enter a client website URL first.');
      return;
    }
    if (!confirm('Research the client website? This will populate the Custom Instructions field with research results.')) return;

    setResearching(true);
    try {
      const response = await axios.post('/api/research/website', {
        url: workshop.client_website,
        clientName: workshop.client_name
      });

      if (response.data.research) {
        setWorkshop({
          ...workshop,
          custom_instructions: response.data.research
        });
        alert('Research complete! The Custom Instructions field has been populated.');
      }
    } catch (error) {
      console.error('Research failed:', error);
      alert('Failed to research client: ' + (error.response?.data?.error || error.message));
    } finally {
      setResearching(false);
    }
  };

  const handleGenerateQuestionsClick = () => {
    if (sessions.length === 0) {
      alert('Please add at least one session before generating questions.');
      return;
    }

    // Only show critical 3-step confirmation if there are existing questions to delete
    if (hasExistingQuestions) {
      setShowGenerateConfirm(true);
    } else {
      // For new workshops with no questions, show simple confirmation
      setShowSimpleGenerateConfirm(true);
    }
  };

  const handleGenerateQuestionsConfirm = async () => {
    setShowGenerateConfirm(false);
    setGenerating(true);
    setGenerationProgress({
      sessionCurrent: 0,
      sessionTotal: sessions.length,
      sessionName: '',
      phase: 'init',
      message: 'Starting...',
      progress: 0,
      checklistCurrent: 0,
      checklistTotal: 0
    });

    let successCount = 0;
    let totalQuestions = 0;
    let totalChecklists = 0;

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];

      setGenerationProgress(prev => ({
        ...prev,
        sessionCurrent: i + 1,
        sessionName: session.name,
        phase: 'init',
        message: `Starting session ${i + 1}...`,
        progress: 0,
        checklistCurrent: 0,
        checklistTotal: 0
      }));

      try {
        // Use SSE endpoint for real-time progress
        await new Promise((resolve, reject) => {
          const eventSource = new EventSource(`/api/workshops/${workshopId}/sessions/${session.id}/generate-stream`);

          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            setGenerationProgress(prev => ({
              ...prev,
              sessionCurrent: i + 1,
              sessionName: session.name,
              phase: data.phase,
              message: data.message,
              progress: data.progress || prev.progress,
              checklistCurrent: data.current || prev.checklistCurrent,
              checklistTotal: data.total || prev.checklistTotal
            }));

            if (data.phase === 'complete') {
              totalQuestions += data.questionCount || 0;
              totalChecklists += data.checklistSuccess || 0;
              successCount++;
              eventSource.close();
              resolve();
            } else if (data.phase === 'error') {
              eventSource.close();
              reject(new Error(data.message));
            }
          };

          eventSource.onerror = () => {
            eventSource.close();
            reject(new Error('Connection lost'));
          };
        });
      } catch (error) {
        console.error(`Failed to generate for session ${session.name}:`, error);
      }
    }

    setGenerationProgress(prev => ({
      ...prev,
      sessionCurrent: sessions.length,
      phase: 'complete',
      message: 'All sessions complete!',
      progress: 100
    }));

    setTimeout(() => {
      alert(`Generated ${totalQuestions} questions with ${totalChecklists} checklists across ${successCount} sessions.`);
      loadAllData();
      setGenerating(false);
      setGenerationProgress({
        sessionCurrent: 0,
        sessionTotal: 0,
        sessionName: '',
        phase: '',
        message: '',
        progress: 0,
        checklistCurrent: 0,
        checklistTotal: 0
      });
    }, 1500);
  };

  // Direct Checklist Mode handlers
  const handleGenerateChecklistClick = () => {
    if (sessions.length === 0) {
      alert('Please add at least one session before generating a checklist.');
      return;
    }
    if (!workshop.mission_statement || !workshop.mission_statement.trim()) {
      alert('Please add a Mission Statement in the Workshop Configuration before generating a direct checklist.');
      return;
    }
    setShowChecklistConfirm(true);
  };

  const handleGenerateChecklistConfirm = async () => {
    setShowChecklistConfirm(false);
    setGeneratingChecklist(true);
    setChecklistProgress({
      sessionCurrent: 0,
      sessionTotal: sessions.length,
      sessionName: '',
      phase: 'init',
      message: 'Starting...',
      progress: 0
    });

    let successCount = 0;
    let totalItems = 0;

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];

      setChecklistProgress(prev => ({
        ...prev,
        sessionCurrent: i + 1,
        sessionName: session.name,
        phase: 'init',
        message: `Starting session ${i + 1}...`,
        progress: 0
      }));

      try {
        // Use SSE endpoint for real-time progress
        await new Promise((resolve, reject) => {
          const eventSource = new EventSource(`/api/workshops/${workshopId}/sessions/${session.id}/generate-checklist-stream`);

          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            setChecklistProgress(prev => ({
              ...prev,
              sessionCurrent: i + 1,
              sessionName: session.name,
              phase: data.phase,
              message: data.message,
              progress: data.progress || prev.progress
            }));

            if (data.phase === 'complete') {
              totalItems += data.itemCount || 0;
              successCount++;
              eventSource.close();
              resolve();
            } else if (data.phase === 'error') {
              eventSource.close();
              reject(new Error(data.message));
            }
          };

          eventSource.onerror = () => {
            eventSource.close();
            reject(new Error('Connection lost'));
          };
        });
      } catch (error) {
        console.error(`Failed to generate checklist for session ${session.name}:`, error);
        alert(`Error generating checklist for ${session.name}: ${error.message}`);
      }
    }

    setChecklistProgress(prev => ({
      ...prev,
      sessionCurrent: sessions.length,
      phase: 'complete',
      message: 'All sessions complete!',
      progress: 100
    }));

    setTimeout(() => {
      alert(`Generated ${totalItems} checklist items across ${successCount} sessions.\n\nSessions are now in Direct Checklist Mode.`);
      loadAllData();
      setGeneratingChecklist(false);
      setChecklistProgress({
        sessionCurrent: 0,
        sessionTotal: 0,
        sessionName: '',
        phase: '',
        message: '',
        progress: 0
      });
    }, 1500);
  };

  // Entity handlers
  const handleAddEntity = async () => {
    if (!newEntity.code.trim() || !newEntity.name.trim()) return;
    try {
      const response = await createEntity(workshopId, newEntity);
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
      await updateEntity(workshopId, id, updated);
      setEntities(entities.map(e => e.id === id ? updated : e));
    } catch (error) {
      console.error('Failed to update entity:', error);
    }
  };

  const handleDeleteEntity = async (id) => {
    if (!confirm('Delete this entity?')) return;
    try {
      await deleteEntity(workshopId, id);
      setEntities(entities.filter(e => e.id !== id));
    } catch (error) {
      alert('Failed to delete entity');
    }
  };

  // Session handlers
  const handleAddSession = async () => {
    if (!newSession.name.trim() || !newSession.module) return;
    try {
      const response = await createSession(workshopId, newSession);
      setSessions([...sessions, response.data]);
      setNewSession({ name: '', module: 'FICO', description: '', agenda: '', question_count: 30, topics: '' });
    } catch (error) {
      alert('Failed to add session: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUpdateSession = async (id, field, value) => {
    try {
      const session = sessions.find(s => s.id === id);
      const updated = { ...session, [field]: value };
      await updateSession(workshopId, id, updated);
      setSessions(sessions.map(s => s.id === id ? updated : s));
    } catch (error) {
      console.error('Failed to update session:', error);
    }
  };

  const handleDeleteSession = async (id) => {
    if (!confirm('Delete this session and its questions?')) return;
    try {
      await deleteSession(workshopId, id);
      setSessions(sessions.filter(s => s.id !== id));
    } catch (error) {
      alert('Failed to delete session');
    }
  };

  // Topics modal functions
  const openTopicsModal = (session) => {
    setEditingTopicsSession(session);
    setEditingTopicsValue(session.topics || '');
    setTopicsModalOpen(true);
  };

  const closeTopicsModal = () => {
    setTopicsModalOpen(false);
    setEditingTopicsSession(null);
    setEditingTopicsValue('');
  };

  const saveTopics = async () => {
    if (editingTopicsSession) {
      await handleUpdateSession(editingTopicsSession.id, 'topics', editingTopicsValue);
      closeTopicsModal();
    }
  };

  // Share modal functions
  const openShareModal = async (session) => {
    setShareSession(session);
    setShareModalOpen(true);
    setShareLoading(true);
    setCopySuccess('');

    try {
      const response = await getShareStatus(workshopId, session.id);
      const status = response.data;
      setShareData({
        enabled: status.enabled,
        url: status.shareUrl || '',
        username: status.username || 'participant',
        password: '', // Password not returned on status check
        token: status.shareUrl ? status.shareUrl.split('/share/')[1] : ''
      });
    } catch (error) {
      console.error('Failed to get share status:', error);
      setShareData({
        enabled: false,
        url: '',
        username: 'participant',
        password: '',
        token: ''
      });
    } finally {
      setShareLoading(false);
    }
  };

  const closeShareModal = () => {
    setShareModalOpen(false);
    setShareSession(null);
    setShareData({
      enabled: false,
      url: '',
      username: '',
      password: '',
      token: ''
    });
    setCopySuccess('');
  };

  const handleToggleSharing = async () => {
    if (!shareSession) return;
    setShareLoading(true);

    try {
      if (shareData.enabled) {
        // Disable sharing
        await disableSharing(workshopId, shareSession.id);
        setShareData({
          enabled: false,
          url: '',
          username: '',
          password: '',
          token: ''
        });
      } else {
        // Enable sharing
        const response = await enableSharing(workshopId, shareSession.id, shareData.username || 'participant');
        const data = response.data;
        const baseUrl = window.location.origin;
        setShareData({
          enabled: true,
          url: `${baseUrl}/share/${data.token}`,
          username: data.username,
          password: data.password,
          token: data.token
        });
      }
      // Reload sessions to update share_enabled status
      const sessionsRes = await getSessions(workshopId);
      setSessions(sessionsRes.data);
    } catch (error) {
      console.error('Failed to toggle sharing:', error);
      alert('Failed to update sharing: ' + (error.response?.data?.error || error.message));
    } finally {
      setShareLoading(false);
    }
  };

  const handleRegeneratePassword = async () => {
    if (!shareSession) return;
    setShareLoading(true);

    try {
      const response = await regeneratePassword(workshopId, shareSession.id);
      setShareData(prev => ({
        ...prev,
        password: response.data.password
      }));
    } catch (error) {
      console.error('Failed to regenerate password:', error);
      alert('Failed to regenerate password');
    } finally {
      setShareLoading(false);
    }
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(type);
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyAllCredentials = async () => {
    const text = `Session: ${shareSession?.name}
URL: ${shareData.url}
Username: ${shareData.username}
Password: ${shareData.password}`;
    await copyToClipboard(text, 'all');
  };

  // Generate combined transcript for all sessions
  const handleGenerateTranscript = async () => {
    setGeneratingTranscript(true);
    setTranscriptResult(null);

    try {
      const response = await axios.post(`/api/session-checklist/workshop/${workshopId}/generate-transcript`);
      setTranscriptResult(response.data);

      // Download the transcript
      if (response.data.transcript) {
        const blob = new Blob([response.data.transcript], { type: 'text/markdown' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${workshop.name.replace(/[^a-z0-9]/gi, '-')}-transcript.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      // Show success message
      const { sessionsProcessed, totalRecordings, transcribedRecordings, newlyTranscribed, legacyRecordings } = response.data;
      let message = `Transcript generated!\n\nSessions: ${sessionsProcessed}\nTotal recordings: ${totalRecordings}`;
      if (legacyRecordings > 0) {
        message += `\n  (${legacyRecordings} legacy, ${totalRecordings - legacyRecordings} new)`;
      }
      message += `\nTranscribed: ${transcribedRecordings}\nNewly transcribed: ${newlyTranscribed}`;
      alert(message);
    } catch (error) {
      console.error('Failed to generate transcript:', error);
      alert('Failed to generate transcript: ' + (error.response?.data?.error || error.message));
    } finally {
      setGeneratingTranscript(false);
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
    <div className="max-w-6xl mx-auto space-y-3 pb-4">
      {/* Generation Progress Modal */}
      {generating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full mx-4">
            <div className="text-center mb-6">
              <Sparkles className="w-12 h-12 text-purple-500 mx-auto mb-4 animate-pulse" />
              <h3 className="text-xl font-bold text-gray-900">
                {generationProgress.phase === 'complete' ? 'Complete!' : 'Generating Questions'}
              </h3>
              <p className="text-gray-500 mt-1">
                Session {generationProgress.sessionCurrent} of {generationProgress.sessionTotal}: <span className="font-medium text-gray-700">{generationProgress.sessionName}</span>
              </p>
            </div>

            {/* Overall Session Progress */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Sessions</span>
                <span>{generationProgress.sessionCurrent}/{generationProgress.sessionTotal}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-nxsys-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(generationProgress.sessionCurrent / generationProgress.sessionTotal) * 100}%` }}
                />
              </div>
            </div>

            {/* Current Task Progress */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{generationProgress.progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    generationProgress.phase === 'complete' ? 'bg-green-500' :
                    generationProgress.phase === 'error' ? 'bg-red-500' :
                    'bg-gradient-to-r from-purple-500 to-nxsys-500'
                  }`}
                  style={{ width: `${generationProgress.progress}%` }}
                />
              </div>
            </div>

            {/* Status Message */}
            <div className="text-center bg-gray-50 rounded-lg p-3">
              <p className={`text-sm font-medium ${
                generationProgress.phase === 'error' ? 'text-red-600' :
                generationProgress.phase === 'complete' ? 'text-green-600' : 'text-gray-700'
              }`}>
                {generationProgress.message || 'Initializing...'}
              </p>
            </div>

            {/* Phase Indicators */}
            <div className="flex justify-center gap-4 mt-4 text-xs">
              <span className={`px-3 py-1 rounded ${
                ['generating', 'saving', 'complete'].includes(generationProgress.phase)
                  ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>Generating</span>
              <span className={`px-3 py-1 rounded ${
                ['saving', 'complete'].includes(generationProgress.phase)
                  ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>Saving</span>
              <span className={`px-3 py-1 rounded ${
                generationProgress.phase === 'complete'
                  ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>Done</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 bg-gray-50 py-2 z-10 border-b">
        <div className="flex items-center space-x-3">
          <Link to="/" className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Workshop Setup</h1>
            <p className="text-xs text-gray-500">{workshop.name}</p>
          </div>
        </div>
      </div>

      {/* Section 1: Workshop Configuration */}
      <section className="bg-white rounded-lg shadow-sm border p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
          <Settings className="w-4 h-4 mr-1.5 text-nxsys-500" />
          Workshop Configuration
        </h2>
        <div className="grid grid-cols-5 gap-3 mb-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">Workshop Name</label>
            <input
              type="text"
              value={workshop.name || ''}
              onChange={(e) => setWorkshop({ ...workshop, name: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">Client Name</label>
            <input
              type="text"
              value={workshop.client_name || ''}
              onChange={(e) => setWorkshop({ ...workshop, client_name: e.target.value })}
              className="w-full px-2 py-1 border rounded text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-0.5">Client Website</label>
            <div className="relative">
              <Globe className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="url"
                value={workshop.client_website || ''}
                onChange={(e) => setWorkshop({ ...workshop, client_website: e.target.value })}
                placeholder="https://example.com"
                className="w-full pl-7 pr-2 py-1 border rounded text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">Q/Session</label>
            <input
              type="number"
              value={workshop.questions_per_session || 30}
              onChange={(e) => setWorkshop({ ...workshop, questions_per_session: parseInt(e.target.value) || 30 })}
              min={5}
              max={100}
              className="w-full px-2 py-1 border rounded text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-0.5">Industry Context</label>
            <textarea
              value={workshop.industry_context || ''}
              onChange={(e) => setWorkshop({ ...workshop, industry_context: e.target.value })}
              placeholder="Client's industry, business model..."
              rows={2}
              className="w-full px-2 py-1 border rounded text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="block text-xs font-medium text-gray-600">Custom Instructions</label>
              <button
                onClick={handleResearchClient}
                disabled={researching || !workshop.client_website}
                className="flex items-center space-x-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50"
              >
                {researching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                <span>Research</span>
              </button>
            </div>
            <div
              onClick={() => {
                setEditingCustomInstructions(workshop.custom_instructions || '');
                setCustomInstructionsModalOpen(true);
              }}
              className="w-full px-2 py-1 border rounded text-sm bg-gray-50 cursor-pointer hover:bg-gray-100 hover:border-nxsys-300 transition-colors min-h-[52px]"
            >
              {workshop.custom_instructions ? (
                <span className="text-gray-800 whitespace-pre-wrap line-clamp-2">{workshop.custom_instructions}</span>
              ) : (
                <span className="text-gray-400 italic">Click to add instructions...</span>
              )}
            </div>
          </div>
        </div>
        {/* Mission Statement for Direct Checklist Mode */}
        <div className="mt-3 pt-3 border-t">
          <label className="block text-xs font-medium text-gray-600 mb-0.5">
            Mission Statement <span className="text-gray-400">(for Direct Checklist Mode)</span>
          </label>
          <textarea
            value={workshop.mission_statement || ''}
            onChange={(e) => setWorkshop({ ...workshop, mission_statement: e.target.value })}
            placeholder="Define the workshop mission/goal. Example: Understand the complete procure-to-pay process including purchase requisitions, purchase orders, goods receipt, invoice verification, and payment processing for all business entities."
            rows={2}
            className="w-full px-2 py-1 border rounded text-sm focus:ring-purple-500 focus:border-purple-500"
          />
          <p className="text-xs text-gray-400 mt-0.5">
            Required for "Generate Direct Checklist" - creates an exhaustive checklist directly without questions.
          </p>
        </div>
      </section>

      {/* Section 2: Business Entities & Sessions - Side by Side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Business Entities */}
        <section className="bg-white rounded-lg shadow-sm border p-3">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
            <Building2 className="w-4 h-4 mr-1.5 text-nxsys-500" />
            Business Entities
            <span className="ml-1.5 text-xs font-normal text-gray-500">({entities.length})</span>
          </h2>

          {/* Entity List */}
          <div className="max-h-32 overflow-y-auto mb-2">
            {entities.length === 0 ? (
              <p className="text-xs text-gray-500">No entities added yet.</p>
            ) : (
              entities.map(entity => (
                <div key={entity.id} className="flex items-center justify-between py-1 border-b last:border-0">
                  <span className="text-sm font-medium">{entity.code} - {entity.name}</span>
                  <button onClick={() => handleDeleteEntity(entity.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add New Entity */}
          <div className="flex items-center space-x-1.5">
            <input
              type="text"
              value={newEntity.code}
              onChange={(e) => setNewEntity({ ...newEntity, code: e.target.value.toUpperCase() })}
              placeholder="Code"
              maxLength={10}
              className="w-16 px-2 py-1 border rounded text-xs"
            />
            <input
              type="text"
              value={newEntity.name}
              onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
              placeholder="Entity Name"
              className="flex-1 px-2 py-1 border rounded text-xs"
            />
            <button
              onClick={handleAddEntity}
              disabled={!newEntity.code.trim() || !newEntity.name.trim()}
              className="flex items-center px-2 py-1 bg-nxsys-500 text-white rounded text-xs hover:bg-nxsys-600 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* Workshop Sessions */}
        <section className="bg-white rounded-lg shadow-sm border p-3">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
            <Calendar className="w-4 h-4 mr-1.5 text-nxsys-500" />
            Workshop Sessions
            <span className="ml-1.5 text-xs font-normal text-gray-500">({sessions.length})</span>
          </h2>

          {/* Sessions List */}
          <div className="max-h-32 overflow-y-auto mb-2">
            {sessions.length === 0 ? (
              <p className="text-xs text-gray-500">No sessions added yet.</p>
            ) : (
              sessions.map((session, idx) => (
                <div key={session.id} className="py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 flex items-center justify-center bg-nxsys-500 text-white rounded text-xs font-bold flex-shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={session.name}
                      onChange={(e) => handleUpdateSession(session.id, 'name', e.target.value)}
                      className="flex-1 px-1.5 py-0.5 border rounded text-xs min-w-0"
                    />
                    <select
                      value={session.module}
                      onChange={(e) => handleUpdateSession(session.id, 'module', e.target.value)}
                      className="px-1 py-0.5 border rounded text-xs w-24"
                    >
                      {moduleOptions.map(m => <option key={m} value={m}>{m.split(' - ')[0]}</option>)}
                    </select>
                    <input
                      type="number"
                      value={session.question_count || 30}
                      onChange={(e) => handleUpdateSession(session.id, 'question_count', parseInt(e.target.value) || 30)}
                      min={5}
                      max={100}
                      className="w-12 px-1 py-0.5 border rounded text-xs"
                    />
                    <button
                      onClick={() => openShareModal(session)}
                      className={`flex-shrink-0 p-1 rounded ${session.share_enabled ? 'text-green-600 bg-green-100 hover:bg-green-200' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'}`}
                      title={session.share_enabled ? 'Sharing enabled - Click to manage' : 'Share this session'}
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteSession(session.id)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="ml-7 mt-1">
                    <button
                      onClick={() => openTopicsModal(session)}
                      className={`w-full px-1.5 py-0.5 border border-dashed rounded text-xs text-left truncate ${
                        session.topics
                          ? 'border-green-400 bg-green-50 text-green-700'
                          : 'border-gray-300 text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      {session.topics || '+ Add topics to cover'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add New Session */}
          <div className="flex items-center space-x-1.5">
            <input
              type="text"
              value={newSession.name}
              onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
              placeholder="Session Name"
              className="flex-1 px-2 py-1 border rounded text-xs"
            />
            <select
              value={newSession.module}
              onChange={(e) => setNewSession({ ...newSession, module: e.target.value })}
              className="px-1 py-1 border rounded text-xs w-20"
            >
              {moduleOptions.map(m => <option key={m} value={m}>{m.split(' - ')[0]}</option>)}
            </select>
            <button
              onClick={handleAddSession}
              disabled={!newSession.name.trim()}
              className="flex items-center px-2 py-1 bg-nxsys-500 text-white rounded text-xs hover:bg-nxsys-600 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* Summary & Actions */}
      <section className="bg-gradient-to-r from-purple-50 to-nxsys-50 rounded-lg border border-nxsys-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-900">{entities.length} entities, {sessions.length} sessions</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSaveWorkshop}
              disabled={saving}
              className="flex items-center space-x-1.5 px-4 py-2 bg-nxsys-500 text-white rounded-lg hover:bg-nxsys-600 disabled:opacity-50 text-sm font-medium"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saveSuccess ? 'Saved!' : 'Save'}</span>
            </button>
            <button
              onClick={handleGenerateQuestionsClick}
              disabled={generating || generatingChecklist || sessions.length === 0}
              className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-purple-500 to-nxsys-500 text-white rounded-lg hover:from-purple-600 hover:to-nxsys-600 disabled:opacity-50 text-sm font-medium"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{generating ? 'Generating...' : hasExistingQuestions ? 'Regenerate Questions' : 'Generate Questions'}</span>
            </button>
            <button
              onClick={handleGenerateChecklistClick}
              disabled={generating || generatingChecklist || sessions.length === 0 || !workshop.mission_statement}
              title={!workshop.mission_statement ? 'Add a mission statement first' : 'Generate direct checklist from mission statement'}
              className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 text-sm font-medium"
            >
              {generatingChecklist ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4" />}
              <span>{generatingChecklist ? 'Generating...' : hasExistingChecklists ? 'Regenerate Checklist' : 'Generate Checklist'}</span>
            </button>
            <button
              onClick={handleGenerateTranscript}
              disabled={generatingTranscript || sessions.length === 0}
              title="Generate a combined transcript from all session recordings"
              className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 text-sm font-medium"
            >
              {generatingTranscript ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>{generatingTranscript ? 'Generating...' : 'Generate Transcript'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Topics Modal */}
      {topicsModalOpen && editingTopicsSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <List className="w-5 h-5 text-nxsys-500" />
                <h3 className="font-semibold text-gray-900">Topics to Cover</h3>
              </div>
              <button onClick={closeTopicsModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-900">Session:</span> {editingTopicsSession.name}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-900">Module:</span> {editingTopicsSession.module}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter topics you want to cover in this session
                </label>
                <textarea
                  value={editingTopicsValue}
                  onChange={(e) => setEditingTopicsValue(e.target.value)}
                  placeholder="Enter topics separated by commas or new lines. Example:
Chart of Accounts structure
Cost Center hierarchy
Profit Center accounting
Bank account management
Asset accounting
Intercompany transactions"
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nxsys-500 focus:border-nxsys-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  AI will generate ~70% of questions around these topics, with the rest covering other relevant areas.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={closeTopicsModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveTopics}
                className="px-4 py-2 text-sm font-medium text-white bg-nxsys-500 hover:bg-nxsys-600 rounded-lg"
              >
                Save Topics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Instructions Modal */}
      {customInstructionsModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-nxsys-500" />
                <h3 className="font-semibold text-gray-900">Custom Instructions</h3>
              </div>
              <button
                onClick={() => setCustomInstructionsModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-600 mb-3">
                Add specific instructions or context that will guide the AI when generating discovery questions.
                This can include company-specific terminology, focus areas, or special requirements.
              </p>
              <textarea
                value={editingCustomInstructions}
                onChange={(e) => setEditingCustomInstructions(e.target.value)}
                placeholder="Enter custom instructions here...

Examples:
- Focus on VAT compliance for UAE operations
- Include questions about multi-currency handling
- Emphasize cold chain logistics requirements
- Consider integration with existing Oracle ERP
- Ask about current reporting pain points"
                rows={15}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nxsys-500 focus:border-nxsys-500 font-mono"
                autoFocus
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setCustomInstructionsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setWorkshop({ ...workshop, custom_instructions: editingCustomInstructions });
                  setCustomInstructionsModalOpen(false);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-nxsys-500 hover:bg-nxsys-600 rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simple Generate Questions Confirmation (for new workshops with no existing questions) */}
      {showSimpleGenerateConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-nxsys-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Generate Questions</h3>
                  <p className="text-purple-100 text-sm">AI-Powered Question Generation</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-600 text-sm mb-4">
                You are about to generate questions for <strong>{sessions.length} session(s)</strong>.
                The AI will create discovery questions tailored to each session's module and topics.
              </p>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-purple-800 text-sm">
                  This process may take a few minutes depending on the number of sessions.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowSimpleGenerateConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSimpleGenerateConfirm(false);
                  handleGenerateQuestionsConfirm();
                }}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-nxsys-500 text-white rounded-lg hover:from-purple-600 hover:to-nxsys-600 font-medium transition-colors"
              >
                Generate Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Critical Generate Questions Confirmation Dialog (for regenerating existing questions) */}
      <CriticalConfirmDialog
        isOpen={showGenerateConfirm}
        onConfirm={handleGenerateQuestionsConfirm}
        onCancel={() => setShowGenerateConfirm(false)}
        title="Regenerate All Questions"
        description={`You are about to regenerate questions for all ${sessions.length} session(s). This will delete ALL existing questions, answers, audio recordings, and observations for every session.`}
      />

      {/* Direct Checklist Confirmation Dialog */}
      {showChecklistConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <List className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Generate Direct Checklist</h3>
                  <p className="text-purple-100 text-sm">Mission-Based Checklist Mode</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-600 text-sm mb-4">
                You are about to generate a <strong>direct checklist</strong> for <strong>{sessions.length} session(s)</strong> based on the mission statement.
              </p>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                <p className="text-indigo-800 text-sm font-medium mb-1">Mission Statement:</p>
                <p className="text-indigo-700 text-sm line-clamp-3">{workshop.mission_statement}</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-purple-800 text-sm">
                  <strong>Direct Checklist Mode:</strong> Instead of questions, the AI will generate an exhaustive checklist of items to gather. During the session, you can record audio and the system will automatically mark items as "obtained" when discussed.
                </p>
              </div>
              {hasExistingChecklists && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
                  <p className="text-orange-800 text-sm">
                    <strong>Warning:</strong> Existing checklist items will be replaced.
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowChecklistConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateChecklistConfirm}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 font-medium transition-colors"
              >
                Generate Checklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checklist Generation Progress */}
      {generatingChecklist && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
                <div>
                  <h3 className="text-lg font-bold text-white">Generating Checklist</h3>
                  <p className="text-purple-100 text-sm">
                    Session {checklistProgress.sessionCurrent} of {checklistProgress.sessionTotal}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-900 mb-1">{checklistProgress.sessionName}</p>
                <p className="text-sm text-gray-600">{checklistProgress.message}</p>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${checklistProgress.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 text-right">{checklistProgress.progress}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Share Session Modal */}
      {shareModalOpen && shareSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-500 to-nxsys-500 rounded-t-xl">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-white" />
                <h3 className="font-semibold text-white">Share Session</h3>
              </div>
              <button onClick={closeShareModal} className="p-1 hover:bg-white/20 rounded text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Session Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-900">Session:</span> {shareSession.name}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-900">Module:</span> {shareSession.module}
                </p>
              </div>

              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Enable Sharing</p>
                  <p className="text-xs text-gray-500">Allow external users to access this session</p>
                </div>
                <button
                  onClick={handleToggleSharing}
                  disabled={shareLoading}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    shareData.enabled ? 'bg-green-500' : 'bg-gray-300'
                  } ${shareLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      shareData.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Share Details (shown when enabled) */}
              {shareData.enabled && (
                <div className="space-y-3 pt-2 border-t">
                  {/* URL */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Share URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={shareData.url}
                        readOnly
                        className="flex-1 px-3 py-2 bg-gray-100 border rounded-lg text-sm text-gray-700 font-mono"
                      />
                      <button
                        onClick={() => copyToClipboard(shareData.url, 'url')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          copySuccess === 'url'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {copySuccess === 'url' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={shareData.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  {/* Username */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={shareData.username}
                        readOnly
                        className="flex-1 px-3 py-2 bg-gray-100 border rounded-lg text-sm text-gray-700"
                      />
                      <button
                        onClick={() => copyToClipboard(shareData.username, 'username')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          copySuccess === 'username'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {copySuccess === 'username' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                    {shareData.password ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shareData.password}
                          readOnly
                          className="flex-1 px-3 py-2 bg-gray-100 border rounded-lg text-sm text-gray-700 font-mono"
                        />
                        <button
                          onClick={() => copyToClipboard(shareData.password, 'password')}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            copySuccess === 'password'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {copySuccess === 'password' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={handleRegeneratePassword}
                          disabled={shareLoading}
                          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                          title="Generate new password"
                        >
                          <RefreshCw className={`w-4 h-4 ${shareLoading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <div className="flex-1 px-3 py-2 bg-gray-50 border border-dashed rounded-lg text-sm text-gray-400 italic">
                          Password not shown for security. Click to generate new one.
                        </div>
                        <button
                          onClick={handleRegeneratePassword}
                          disabled={shareLoading}
                          className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 flex items-center gap-1"
                          title="Generate new password"
                        >
                          <RefreshCw className={`w-4 h-4 ${shareLoading ? 'animate-spin' : ''}`} />
                          <span className="text-sm">Generate</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Copy All Button (only show when password is available) */}
                  {shareData.password && (
                    <button
                      onClick={copyAllCredentials}
                      className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        copySuccess === 'all'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {copySuccess === 'all' ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy All Credentials
                        </>
                      )}
                    </button>
                  )}

                  {/* Info about exclusive access */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                    <p className="text-yellow-800 text-xs">
                      <strong>Note:</strong> Only one user can access the shared session at a time.
                      If someone is already using it, others will see a "Session in use" message.
                    </p>
                  </div>
                </div>
              )}

              {shareLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-nxsys-500" />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={closeShareModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkshopSetup;
