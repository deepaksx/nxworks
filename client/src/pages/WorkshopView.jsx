import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getWorkshop, getSessions, getEntities } from '../services/workshopApi';
import {
  CheckCircle,
  Circle,
  PlayCircle,
  ChevronRight,
  Settings,
  ArrowLeft
} from 'lucide-react';

const moduleColors = {
  FICO: 'bg-blue-100 text-blue-800',
  MM: 'bg-amber-100 text-amber-800',
  SD: 'bg-green-100 text-green-800',
  PP: 'bg-purple-100 text-purple-800',
  QM: 'bg-rose-100 text-rose-800',
  HR: 'bg-cyan-100 text-cyan-800',
  Integration: 'bg-indigo-100 text-indigo-800'
};

const statusConfig = {
  not_started: { icon: Circle, color: 'text-gray-400' },
  in_progress: { icon: PlayCircle, color: 'text-amber-500' },
  completed: { icon: CheckCircle, color: 'text-green-500' }
};

function WorkshopView() {
  const { workshopId } = useParams();
  const [workshop, setWorkshop] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkshopData();
  }, [workshopId]);

  const loadWorkshopData = async () => {
    try {
      const [workshopRes, sessionsRes, entitiesRes] = await Promise.all([
        getWorkshop(workshopId),
        getSessions(workshopId),
        getEntities(workshopId)
      ]);
      setWorkshop(workshopRes.data);
      setSessions(sessionsRes.data);
      setEntities(entitiesRes.data);
    } catch (error) {
      console.error('Failed to load workshop:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nxsys-500"></div>
      </div>
    );
  }

  if (!workshop) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Workshop not found.</p>
        <Link to="/" className="text-nxsys-500 hover:underline mt-2 inline-block">
          Back to Workshops
        </Link>
      </div>
    );
  }

  const totalQuestions = sessions.reduce((sum, s) => sum + parseInt(s.question_count || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{workshop.name}</h1>
            {workshop.client_name && (
              <p className="text-sm text-gray-500">{workshop.client_name}</p>
            )}
          </div>
        </div>
        <Link
          to={`/workshop/${workshopId}/setup`}
          className="flex items-center space-x-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Setup</span>
        </Link>
      </div>

      {/* Stats Bar */}
      <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Sessions:</span>
          <span className="font-bold text-gray-900">{sessions.length}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Entities:</span>
          <span className="font-bold text-gray-900">{entities.length}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Questions:</span>
          <span className="font-bold text-gray-900">{totalQuestions}</span>
        </div>
      </div>

      {/* Sessions Table */}
      {sessions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-500 mb-4">No sessions created yet.</p>
          <Link
            to={`/workshop/${workshopId}/setup`}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-nxsys-500 text-white rounded-md hover:bg-nxsys-600"
          >
            <Settings className="w-4 h-4" />
            <span>Go to Setup to create sessions</span>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Module</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Questions</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((session) => {
                const StatusIcon = statusConfig[session.status]?.icon || Circle;

                return (
                  <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2">
                      <span className="font-bold text-nxsys-500">{session.session_number}</span>
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/workshop/${workshopId}/session/${session.id}`} className="hover:text-nxsys-500">
                        <p className="font-medium text-gray-900">{session.name}</p>
                        <p className="text-xs text-gray-500 truncate max-w-md">{session.description}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${moduleColors[session.module] || 'bg-gray-100 text-gray-800'}`}>
                        {session.module}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-600">
                        {session.question_count || 0}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <StatusIcon className={`w-4 h-4 ${statusConfig[session.status]?.color}`} />
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        to={`/workshop/${workshopId}/session/${session.id}`}
                        className="p-1.5 hover:bg-nxsys-50 rounded transition-colors inline-flex text-gray-400 hover:text-nxsys-600"
                        title="View Session"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Entities Legend */}
      {entities.length > 0 && (
        <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500">
          <span className="font-medium">Entities:</span>
          {entities.map((entity, index) => {
            const colors = ['bg-blue-100 text-blue-800', 'bg-amber-100 text-amber-800', 'bg-green-100 text-green-800', 'bg-purple-100 text-purple-800', 'bg-rose-100 text-rose-800'];
            return (
              <span key={entity.id} className={`px-2 py-0.5 rounded ${colors[index % colors.length]}`}>
                {entity.code} - {entity.name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkshopView;
