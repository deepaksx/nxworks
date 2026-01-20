import { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Users,
  User,
  Briefcase,
  Building,
  Mail,
  Check,
  UserPlus
} from 'lucide-react';
import { getParticipants, addParticipant, deleteParticipant } from '../services/api';

function ParticipantsModal({ sessionId, sessionName, onClose, onStartSession }) {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // New participant form
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newCompany, setNewCompany] = useState('Al Rawabi');
  const [newEmail, setNewEmail] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadParticipants();
  }, [sessionId]);

  const loadParticipants = async () => {
    try {
      const response = await getParticipants(sessionId);
      setParticipants(response.data);
    } catch (error) {
      console.error('Failed to load participants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddParticipant = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setAdding(true);
    try {
      const response = await addParticipant(sessionId, {
        name: newName.trim(),
        role: newRole.trim(),
        company: newCompany.trim(),
        email: newEmail.trim()
      });
      setParticipants([...participants, response.data]);
      setNewName('');
      setNewRole('');
      setNewEmail('');
      setShowForm(false);
    } catch (error) {
      console.error('Failed to add participant:', error);
      alert('Failed to add participant');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteParticipant = async (id) => {
    if (!confirm('Remove this participant?')) return;
    try {
      await deleteParticipant(id);
      setParticipants(participants.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete participant:', error);
    }
  };

  const handleStartSession = () => {
    if (participants.length === 0) {
      alert('Please add at least one participant before starting the session.');
      return;
    }
    onStartSession(participants);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-nxsys-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-nxsys-500 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Session Participants</h2>
              <p className="text-sm text-gray-500">{sessionName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nxsys-500"></div>
            </div>
          ) : (
            <>
              {/* Participants List */}
              {participants.length > 0 ? (
                <div className="space-y-3 mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    {participants.length} Participant{participants.length !== 1 ? 's' : ''} Added
                  </p>
                  {participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-nxsys-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-nxsys-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{participant.name}</p>
                          <div className="flex items-center space-x-3 text-sm text-gray-500">
                            {participant.role && (
                              <span className="flex items-center">
                                <Briefcase className="w-3 h-3 mr-1" />
                                {participant.role}
                              </span>
                            )}
                            {participant.company && (
                              <span className="flex items-center">
                                <Building className="w-3 h-3 mr-1" />
                                {participant.company}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteParticipant(participant.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 mb-6 bg-gray-50 rounded-xl">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No participants added yet</p>
                  <p className="text-sm text-gray-400 mt-1">Add participants who will attend this session</p>
                </div>
              )}

              {/* Add Participant Form */}
              {showForm ? (
                <form onSubmit={handleAddParticipant} className="border-2 border-dashed border-nxsys-200 rounded-xl p-4 bg-nxsys-50">
                  <p className="text-sm font-medium text-nxsys-700 mb-4">Add New Participant</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        <User className="w-3 h-3 inline mr-1" />
                        Name *
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Full name"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nxsys-500 focus:border-nxsys-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        <Briefcase className="w-3 h-3 inline mr-1" />
                        Role / Position *
                      </label>
                      <input
                        type="text"
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        placeholder="e.g., Finance Manager"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nxsys-500 focus:border-nxsys-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        <Building className="w-3 h-3 inline mr-1" />
                        Company
                      </label>
                      <input
                        type="text"
                        value={newCompany}
                        onChange={(e) => setNewCompany(e.target.value)}
                        placeholder="Company name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nxsys-500 focus:border-nxsys-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        <Mail className="w-3 h-3 inline mr-1" />
                        Email
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="email@company.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-nxsys-500 focus:border-nxsys-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={adding || !newName.trim() || !newRole.trim()}
                      className="flex items-center px-4 py-2 bg-nxsys-500 text-white rounded-lg hover:bg-nxsys-600 transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {adding ? 'Adding...' : 'Add Participant'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-nxsys-500 hover:text-nxsys-600 transition-colors"
                >
                  <UserPlus className="w-5 h-5 mr-2" />
                  Add Participant
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {participants.length > 0
              ? `${participants.length} participant${participants.length !== 1 ? 's' : ''} will be available as respondents`
              : 'Add participants to continue'}
          </p>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartSession}
              disabled={participants.length === 0}
              className="flex items-center px-6 py-2 bg-nxsys-500 text-white rounded-lg hover:bg-nxsys-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 mr-2" />
              Start Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ParticipantsModal;
