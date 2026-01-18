import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSessions } from '../services/api';
import {
  Calendar,
  Clock,
  Users,
  CheckCircle,
  Circle,
  PlayCircle,
  ChevronRight,
  BarChart3
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
  not_started: { icon: Circle, color: 'text-gray-400', label: 'Not Started' },
  in_progress: { icon: PlayCircle, color: 'text-amber-500', label: 'In Progress' },
  completed: { icon: CheckCircle, color: 'text-green-500', label: 'Completed' }
};

function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await getSessions();
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalQuestions = sessions.reduce((sum, s) => sum + parseInt(s.total_questions || 0), 0);
  const answeredQuestions = sessions.reduce((sum, s) => sum + parseInt(s.answered_questions || 0), 0);
  const overallProgress = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rawabi-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{sessions.length}</p>
            </div>
            <div className="w-12 h-12 bg-rawabi-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-rawabi-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Questions</p>
              <p className="text-2xl font-bold text-gray-900">{totalQuestions}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Answered</p>
              <p className="text-2xl font-bold text-gray-900">{answeredQuestions}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Progress</p>
              <p className="text-2xl font-bold text-gray-900">{overallProgress}%</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-rawabi-500 rounded-full transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sessions Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Workshop Sessions</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sessions.map((session) => {
            const StatusIcon = statusConfig[session.status]?.icon || Circle;
            const progress = session.total_questions > 0
              ? Math.round((session.answered_questions / session.total_questions) * 100)
              : 0;

            return (
              <Link
                key={session.id}
                to={`/session/${session.id}`}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-rawabi-200 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl font-bold text-rawabi-600">
                      {session.session_number}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-rawabi-700 transition-colors">
                        {session.name}
                      </h3>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${moduleColors[session.module]}`}>
                        {session.module}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-rawabi-500 transition-colors" />
                </div>

                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{session.description}</p>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-4 text-gray-500">
                    <span className="flex items-center">
                      <Users className="w-4 h-4 mr-1" />
                      {session.lead_consultant}
                    </span>
                    <span className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <StatusIcon className={`w-4 h-4 mr-1 ${statusConfig[session.status]?.color}`} />
                    <span className="text-gray-600">{progress}%</span>
                  </div>
                </div>

                <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rawabi-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  {session.answered_questions || 0} of {session.total_questions || 0} questions answered
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Entities Legend */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">Entities Covered</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="font-bold text-blue-700">ARDC</span>
            </div>
            <div>
              <p className="font-medium text-gray-900">Al Rawabi Dairy Company</p>
              <p className="text-xs text-gray-500">Dairy Production, Fresh Juices</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <span className="font-bold text-amber-700">ENF</span>
            </div>
            <div>
              <p className="font-medium text-gray-900">Emirates National Food</p>
              <p className="text-xs text-gray-500">Poultry, Al Rawdha Brand</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="font-bold text-green-700">GF</span>
            </div>
            <div>
              <p className="font-medium text-gray-900">Greenfields for Feed</p>
              <p className="text-xs text-gray-500">Animal Feed Manufacturing</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
