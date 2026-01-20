import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getWorkshops, createWorkshop, deleteWorkshop } from '../services/workshopApi';
import api from '../services/api';
import {
  Plus,
  FolderOpen,
  Settings,
  Trash2,
  Building2,
  FileText,
  X,
  Download,
  Upload,
  Database
} from 'lucide-react';

const statusColors = {
  setup: 'bg-amber-100 text-amber-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800'
};

function Dashboard() {
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkshop, setNewWorkshop] = useState({ name: '', client_name: '' });
  const [creating, setCreating] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadWorkshops();
  }, []);

  const loadWorkshops = async () => {
    try {
      const response = await getWorkshops();
      setWorkshops(response.data);
    } catch (error) {
      console.error('Failed to load workshops:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkshop = async (e) => {
    e.preventDefault();
    if (!newWorkshop.name.trim()) return;

    setCreating(true);
    try {
      await createWorkshop(newWorkshop);
      await loadWorkshops();
      setShowCreateModal(false);
      setNewWorkshop({ name: '', client_name: '' });
    } catch (error) {
      console.error('Failed to create workshop:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteWorkshop = async (id, name) => {
    if (!confirm(`Delete workshop "${name}"? This will delete all sessions and questions.`)) return;

    try {
      await deleteWorkshop(id);
      await loadWorkshops();
    } catch (error) {
      console.error('Failed to delete workshop:', error);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const response = await api.get('/admin/backup');
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nxworks-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('Backup downloaded successfully!');
    } catch (error) {
      console.error('Backup failed:', error);
      alert('Failed to create backup: ' + (error.response?.data?.error || error.message));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('This will REPLACE all existing data with the backup. Are you sure?')) {
      e.target.value = '';
      return;
    }

    setRestoreLoading(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      const response = await api.post('/admin/restore', backup);
      alert(`Restore completed!\n\n${response.data.message}`);
      await loadWorkshops();
    } catch (error) {
      console.error('Restore failed:', error);
      alert('Failed to restore backup: ' + (error.response?.data?.error || error.message));
    } finally {
      setRestoreLoading(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nxsys-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input for restore */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleRestore}
        accept=".json"
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Workshops</h1>
          <p className="text-sm text-gray-500">Manage your SAP S/4HANA pre-discovery workshops</p>
        </div>
        <div className="flex items-center space-x-2">
          {/* Backup/Restore Buttons */}
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="flex items-center space-x-1 px-3 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            title="Download Backup"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm">{backupLoading ? 'Backing up...' : 'Backup'}</span>
          </button>
          <button
            onClick={handleRestoreClick}
            disabled={restoreLoading}
            className="flex items-center space-x-1 px-3 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            title="Restore from Backup"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm">{restoreLoading ? 'Restoring...' : 'Restore'}</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-nxsys-500 text-white rounded-md hover:bg-nxsys-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Workshop</span>
          </button>
        </div>
      </div>

      {/* Workshops Table */}
      {workshops.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No workshops created yet.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-nxsys-500 text-white rounded-md hover:bg-nxsys-600"
          >
            <Plus className="w-4 h-4" />
            <span>Create Your First Workshop</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Workshop</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Sessions</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Questions</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workshops.map((workshop) => (
                <tr key={workshop.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2">
                    <span className="text-gray-900">{workshop.client_name || '-'}</span>
                  </td>
                  <td className="px-4 py-2">
                    <Link to={`/workshop/${workshop.id}`} className="font-medium text-gray-900 hover:text-nxsys-500">
                      {workshop.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {workshop.session_count || 0}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {workshop.question_count || 0}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[workshop.status] || statusColors.setup}`}>
                      {workshop.status || 'setup'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end space-x-1">
                      <Link
                        to={`/workshop/${workshop.id}`}
                        className="p-1.5 text-nxsys-600 hover:bg-nxsys-50 rounded transition-colors"
                        title="Open Workshop"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </Link>
                      <Link
                        to={`/workshop/${workshop.id}/setup`}
                        className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="Setup"
                      >
                        <Settings className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDeleteWorkshop(workshop.id, workshop.name)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete Workshop"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Workshop Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Create New Workshop</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkshop} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Workshop Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newWorkshop.name}
                  onChange={(e) => setNewWorkshop({ ...newWorkshop, name: e.target.value })}
                  placeholder="e.g., Al Rawabi S/4HANA Pre-Discovery"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nxsys-500 focus:border-nxsys-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Name
                </label>
                <input
                  type="text"
                  value={newWorkshop.client_name}
                  onChange={(e) => setNewWorkshop({ ...newWorkshop, client_name: e.target.value })}
                  placeholder="e.g., Al Rawabi Dairy Company"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-nxsys-500 focus:border-nxsys-500"
                />
              </div>

              <div className="flex items-center space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newWorkshop.name.trim()}
                  className="flex-1 px-4 py-2 bg-nxsys-500 text-white rounded-md hover:bg-nxsys-600 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Workshop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
