import { useState, useEffect } from 'react';
import { getAudienceProfiles, addAudienceProfile, deleteAudienceProfile } from '../../services/adminApi';
import { Users, Plus, Trash2, Loader2 } from 'lucide-react';

const departmentSuggestions = [
  'Finance',
  'Procurement',
  'Sales',
  'Warehouse/Inventory',
  'Production',
  'Quality Assurance',
  'IT',
  'HR',
  'Executive Management'
];

function AudienceForm() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newProfile, setNewProfile] = useState({
    department: '',
    typical_roles: '',
    key_concerns: ''
  });

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const response = await getAudienceProfiles();
      setProfiles(response.data);
    } catch (error) {
      console.error('Failed to load audience profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newProfile.department.trim()) return;

    setSaving(true);
    try {
      const response = await addAudienceProfile(newProfile);
      setProfiles(prev => [...prev, response.data]);
      setNewProfile({ department: '', typical_roles: '', key_concerns: '' });
      setShowForm(false);
    } catch (error) {
      console.error('Failed to add audience profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this audience profile?')) return;

    try {
      await deleteAudienceProfile(id);
      setProfiles(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete audience profile:', error);
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
          <Users className="w-4 h-4" />
          <span>Define the target audience for tailored question generation</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-1 px-3 py-1.5 bg-nxsys-500 text-white rounded-md text-sm hover:bg-nxsys-600"
        >
          <Plus className="w-4 h-4" />
          <span>Add Audience</span>
        </button>
      </div>

      {/* New Profile Form */}
      {showForm && (
        <form onSubmit={handleAdd} className="border border-nxsys-200 bg-nxsys-50 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department *
            </label>
            <div className="flex space-x-2">
              <select
                value={newProfile.department}
                onChange={(e) => setNewProfile(prev => ({ ...prev, department: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              >
                <option value="">Select or type below...</option>
                {departmentSuggestions.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <input
                type="text"
                value={newProfile.department}
                onChange={(e) => setNewProfile(prev => ({ ...prev, department: e.target.value }))}
                placeholder="Or type custom..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Typical Roles
            </label>
            <input
              type="text"
              value={newProfile.typical_roles}
              onChange={(e) => setNewProfile(prev => ({ ...prev, typical_roles: e.target.value }))}
              placeholder="e.g., Finance Manager, Accountant, CFO"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key Concerns
            </label>
            <textarea
              value={newProfile.key_concerns}
              onChange={(e) => setNewProfile(prev => ({ ...prev, key_concerns: e.target.value }))}
              placeholder="What are the main concerns this audience typically has? e.g., reporting accuracy, compliance, month-end close efficiency"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setNewProfile({ department: '', typical_roles: '', key_concerns: '' });
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !newProfile.department.trim()}
              className="flex items-center space-x-1 px-3 py-1.5 bg-nxsys-500 text-white rounded-md text-sm hover:bg-nxsys-600 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Add</span>
            </button>
          </div>
        </form>
      )}

      {/* Existing Profiles */}
      {profiles.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>No audience profiles defined yet</p>
          <p className="text-sm">Add departments and roles to tailor question generation</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map(profile => (
            <div
              key={profile.id}
              className="border border-gray-200 rounded-lg p-4 flex justify-between items-start"
            >
              <div className="space-y-1">
                <h4 className="font-medium text-gray-900">{profile.department}</h4>
                {profile.typical_roles && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Roles:</span> {profile.typical_roles}
                  </p>
                )}
                {profile.key_concerns && (
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">Concerns:</span> {profile.key_concerns}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDelete(profile.id)}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AudienceForm;
