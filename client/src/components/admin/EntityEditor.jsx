import { useState, useEffect } from 'react';
import { getEntities, createEntity, updateEntity, deleteEntity } from '../../services/adminApi';
import { Building2, Save, Loader2, Plus, Trash2, X } from 'lucide-react';

const industryOptions = [
  'Food & Beverage',
  'Dairy Products',
  'Animal Feed & Agriculture',
  'Manufacturing',
  'Distribution & Logistics',
  'Retail',
  'Consumer Goods',
  'Healthcare',
  'Technology',
  'Financial Services',
  'Energy & Utilities',
  'Construction',
  'Transportation'
];

const sectorOptions = [
  'FMCG',
  'Agriculture',
  'Food Processing',
  'Cold Chain Logistics',
  'Retail Distribution',
  'B2B Industrial',
  'B2C Consumer',
  'Government',
  'Private Enterprise'
];

function EntityEditor() {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [editedEntities, setEditedEntities] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEntity, setNewEntity] = useState({
    code: '',
    name: '',
    description: '',
    industry: '',
    sector: '',
    business_context: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadEntities();
  }, []);

  const loadEntities = async () => {
    try {
      const response = await getEntities();
      setEntities(response.data);
      // Initialize edited state
      const edited = {};
      response.data.forEach(e => {
        edited[e.id] = {
          industry: e.industry || '',
          sector: e.sector || '',
          business_context: e.business_context || ''
        };
      });
      setEditedEntities(edited);
    } catch (error) {
      console.error('Failed to load entities:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (entityId, field, value) => {
    setEditedEntities(prev => ({
      ...prev,
      [entityId]: {
        ...prev[entityId],
        [field]: value
      }
    }));
  };

  const handleSave = async (entityId) => {
    setSaving(prev => ({ ...prev, [entityId]: true }));
    try {
      await updateEntity(entityId, editedEntities[entityId]);
      // Update local state
      setEntities(prev => prev.map(e =>
        e.id === entityId ? { ...e, ...editedEntities[entityId] } : e
      ));
    } catch (error) {
      console.error('Failed to save entity:', error);
    } finally {
      setSaving(prev => ({ ...prev, [entityId]: false }));
    }
  };

  const handleCreate = async () => {
    if (!newEntity.code.trim() || !newEntity.name.trim()) {
      alert('Entity code and name are required');
      return;
    }

    setCreating(true);
    try {
      const response = await createEntity(newEntity);
      setEntities(prev => [...prev, response.data]);
      setEditedEntities(prev => ({
        ...prev,
        [response.data.id]: {
          industry: response.data.industry || '',
          sector: response.data.sector || '',
          business_context: response.data.business_context || ''
        }
      }));
      setNewEntity({
        code: '',
        name: '',
        description: '',
        industry: '',
        sector: '',
        business_context: ''
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to create entity:', error);
      alert('Failed to create entity: ' + (error.response?.data?.error || error.message));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (entityId, entityCode) => {
    if (!confirm(`Delete entity "${entityCode}"? This cannot be undone.`)) return;

    try {
      await deleteEntity(entityId);
      setEntities(prev => prev.filter(e => e.id !== entityId));
      const newEdited = { ...editedEntities };
      delete newEdited[entityId];
      setEditedEntities(newEdited);
    } catch (error) {
      console.error('Failed to delete entity:', error);
      alert('Failed to delete entity');
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <Building2 className="w-4 h-4" />
          <span>Configure industry and business context for each entity to improve question generation</span>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center space-x-1 px-3 py-1.5 bg-nxsys-500 text-white rounded-md text-sm hover:bg-nxsys-600"
        >
          <Plus className="w-4 h-4" />
          <span>Add Entity</span>
        </button>
      </div>

      {/* Add Entity Form */}
      {showAddForm && (
        <div className="border-2 border-nxsys-300 bg-nxsys-50 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Add New Entity</h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity Code *
              </label>
              <input
                type="text"
                value={newEntity.code}
                onChange={(e) => setNewEntity(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="e.g., ARDC"
                maxLength={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity Name *
              </label>
              <input
                type="text"
                value={newEntity.name}
                onChange={(e) => setNewEntity(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Al Rawabi Dairy Company"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={newEntity.description}
              onChange={(e) => setNewEntity(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of the entity"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Industry
              </label>
              <select
                value={newEntity.industry}
                onChange={(e) => setNewEntity(prev => ({ ...prev, industry: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              >
                <option value="">Select Industry</option>
                {industryOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sector
              </label>
              <select
                value={newEntity.sector}
                onChange={(e) => setNewEntity(prev => ({ ...prev, sector: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              >
                <option value="">Select Sector</option>
                {sectorOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Context
            </label>
            <textarea
              value={newEntity.business_context}
              onChange={(e) => setNewEntity(prev => ({ ...prev, business_context: e.target.value }))}
              placeholder="Describe the business operations, key processes, and any specific context relevant to SAP implementation..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newEntity.code.trim() || !newEntity.name.trim()}
              className="flex items-center space-x-1 px-3 py-1.5 bg-nxsys-500 text-white rounded-md text-sm hover:bg-nxsys-600 disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Create Entity</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {entities.length === 0 && !showAddForm && (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Entities Configured</h3>
          <p className="text-gray-500 mb-4">Add business entities to generate targeted questions</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center space-x-1 px-4 py-2 bg-nxsys-500 text-white rounded-md hover:bg-nxsys-600"
          >
            <Plus className="w-4 h-4" />
            <span>Add Your First Entity</span>
          </button>
        </div>
      )}

      {/* Entity List */}
      {entities.map(entity => (
        <div
          key={entity.id}
          className="border border-gray-200 rounded-lg p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">
                {entity.code} - {entity.name}
              </h3>
              {entity.description && (
                <p className="text-sm text-gray-500">{entity.description}</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleSave(entity.id)}
                disabled={saving[entity.id]}
                className="flex items-center space-x-1 px-3 py-1.5 bg-nxsys-500 text-white rounded-md text-sm hover:bg-nxsys-600 disabled:opacity-50"
              >
                {saving[entity.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save</span>
              </button>
              <button
                onClick={() => handleDelete(entity.id, entity.code)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                title="Delete entity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Industry
              </label>
              <select
                value={editedEntities[entity.id]?.industry || ''}
                onChange={(e) => handleChange(entity.id, 'industry', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              >
                <option value="">Select Industry</option>
                {industryOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sector
              </label>
              <select
                value={editedEntities[entity.id]?.sector || ''}
                onChange={(e) => handleChange(entity.id, 'sector', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
              >
                <option value="">Select Sector</option>
                {sectorOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Context
            </label>
            <textarea
              value={editedEntities[entity.id]?.business_context || ''}
              onChange={(e) => handleChange(entity.id, 'business_context', e.target.value)}
              placeholder="Describe the business operations, key processes, and any specific context relevant to SAP implementation..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-nxsys-500 focus:border-nxsys-500"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default EntityEditor;
