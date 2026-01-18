import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, FileText, HelpCircle } from 'lucide-react';

function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-rawabi-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">AR</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Al Rawabi</h1>
                <p className="text-xs text-gray-500">S/4HANA Pre-Discovery Workshop</p>
              </div>
            </Link>

            <nav className="flex items-center space-x-4">
              <Link
                to="/"
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors
                  ${location.pathname === '/'
                    ? 'bg-rawabi-50 text-rawabi-700'
                    : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Home className="w-4 h-4 mr-2" />
                Dashboard
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <p>NXSYS - AI-Powered SAP Systems Integrator</p>
            <p>January 19-22, 2026</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
