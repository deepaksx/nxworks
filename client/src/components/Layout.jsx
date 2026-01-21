import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';

function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* NXSYS Header */}
      <header className="bg-white shadow-lg sticky top-0 z-50 overflow-hidden">
        {/* Tech circuit animated bar */}
        <div className="h-1 relative overflow-hidden bg-gradient-to-r from-nxsys-600 via-nxsys-500 to-nxsys-600">
          {/* Scanning line - very slow, right to left */}
          <div
            className="absolute h-full w-48 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            style={{ animation: 'scanLine 15s linear infinite' }}
          ></div>
        </div>

        {/* Circuit pattern background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top: '4px' }}>
          {/* Horizontal circuit lines */}
          <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.12 }}>
            {/* Circuit lines */}
            <line x1="0" y1="20" x2="100%" y2="20" stroke="#E63946" strokeWidth="1" strokeDasharray="8 4" />
            <line x1="0" y1="55" x2="100%" y2="55" stroke="#E63946" strokeWidth="1" strokeDasharray="12 6" />

            {/* Vertical connectors */}
            <line x1="15%" y1="20" x2="15%" y2="55" stroke="#E63946" strokeWidth="1" />
            <line x1="35%" y1="10" x2="35%" y2="35" stroke="#E63946" strokeWidth="1" />
            <line x1="55%" y1="35" x2="55%" y2="70" stroke="#E63946" strokeWidth="1" />
            <line x1="75%" y1="20" x2="75%" y2="55" stroke="#E63946" strokeWidth="1" />
            <line x1="90%" y1="15" x2="90%" y2="45" stroke="#E63946" strokeWidth="1" />
          </svg>

          {/* Floating ice flake */}
          <div
            className="absolute text-lg"
            style={{
              top: '35px',
              filter: 'blur(0.5px)',
              opacity: 0.5,
              color: '#ffb6c1',
              animation: 'dataFlow 90s linear infinite, snowflakeSpin 4s linear infinite'
            }}
          >❄</div>

          {/* Snowfall breeze effect - dense */}
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '2%', animation: 'snowfall1 12s ease-in-out infinite' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '5%', animation: 'snowfall2 14s ease-in-out infinite 2s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/30" style={{ left: '8%', animation: 'snowfall3 11s ease-in-out infinite 1s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '11%', animation: 'snowfall1 13s ease-in-out infinite 4s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '14%', animation: 'snowfall2 10s ease-in-out infinite 1.5s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '17%', animation: 'snowfall3 15s ease-in-out infinite 3s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '20%', animation: 'snowfall1 12s ease-in-out infinite 5s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '23%', animation: 'snowfall2 16s ease-in-out infinite 0.5s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/30" style={{ left: '26%', animation: 'snowfall3 11.5s ease-in-out infinite 3.5s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '29%', animation: 'snowfall1 14s ease-in-out infinite 1.2s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '32%', animation: 'snowfall2 11s ease-in-out infinite 6s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '35%', animation: 'snowfall3 13.5s ease-in-out infinite 4.5s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/30" style={{ left: '38%', animation: 'snowfall1 10s ease-in-out infinite 2.5s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '41%', animation: 'snowfall2 14.5s ease-in-out infinite 0.8s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '44%', animation: 'snowfall3 12.5s ease-in-out infinite 5.5s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '47%', animation: 'snowfall1 10.5s ease-in-out infinite 3.2s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '50%', animation: 'snowfall2 13.5s ease-in-out infinite 1.8s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '53%', animation: 'snowfall3 11s ease-in-out infinite 4.8s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/30" style={{ left: '56%', animation: 'snowfall1 15s ease-in-out infinite 0.4s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '59%', animation: 'snowfall2 10.5s ease-in-out infinite 3.8s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '62%', animation: 'snowfall3 13s ease-in-out infinite 6.5s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '65%', animation: 'snowfall1 11.5s ease-in-out infinite 1.4s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '68%', animation: 'snowfall2 14s ease-in-out infinite 5.2s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '71%', animation: 'snowfall3 10.8s ease-in-out infinite 2.6s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/30" style={{ left: '74%', animation: 'snowfall1 12.8s ease-in-out infinite 0.2s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '77%', animation: 'snowfall2 11.5s ease-in-out infinite 4.2s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '80%', animation: 'snowfall3 14.5s ease-in-out infinite 7s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '83%', animation: 'snowfall1 10.2s ease-in-out infinite 3.4s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '86%', animation: 'snowfall2 12.6s ease-in-out infinite 1s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '89%', animation: 'snowfall3 11.8s ease-in-out infinite 5.8s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/30" style={{ left: '92%', animation: 'snowfall1 14.2s ease-in-out infinite 2.2s' }}></div>
          <div className="absolute w-1 h-1 rounded-full bg-nxsys-500/20" style={{ left: '95%', animation: 'snowfall2 11s ease-in-out infinite 1.6s' }}></div>
          <div className="absolute w-1.5 h-1.5 rounded-full bg-nxsys-500/25" style={{ left: '98%', animation: 'snowfall3 13.5s ease-in-out infinite 4.6s' }}></div>
        </div>

        <div className="w-full mx-auto px-6 relative">
          <div className="flex justify-between items-center h-20">
            <Link to="/" className="flex items-center space-x-5">
              <img
                src="/nxsys-logo.png"
                alt="NXSYS"
                className="h-16 w-auto drop-shadow-md hover:drop-shadow-lg transition-all duration-300"
                style={{
                  filter: 'contrast(1.05) brightness(1.02)',
                  animation: 'logoGlow 3s ease-in-out infinite'
                }}
              />
              <div className="flex items-center">
                <div className="w-px h-10 bg-gray-300 mx-4 hidden sm:block"></div>
                <div className="hidden sm:block">
                  <span className="text-lg font-bold tracking-wide"><span className="bg-nxsys-500 text-white px-1.5 py-0.5 rounded">NX</span><span className="text-gray-800">Works</span></span>
                </div>
              </div>
            </Link>

            <nav className="flex items-center space-x-3">
              <Link
                to="/"
                className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm
                  ${location.pathname === '/'
                    ? 'bg-nxsys-500 text-white hover:bg-nxsys-600 shadow-nxsys-500/30'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
              >
                <Home className="w-4 h-4 mr-2" />
                Dashboard
              </Link>
            </nav>
          </div>
        </div>

        {/* Bottom border with subtle gradient */}
        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full mx-auto px-6 py-4">
        <Outlet />
      </main>

      {/* NXSYS Footer */}
      <footer className="bg-white border-t border-gray-200 py-3">
        <div className="w-full mx-auto px-6 flex justify-between items-center text-xs">
          <span className="text-gray-500">
            <span className="text-gray-900 font-semibold">NXSYS</span>
            <span className="text-nxsys-500 mx-2">|</span>
            UAE's Leading SAP Integrator
          </span>
          <span className="text-gray-400">Jan 19-22, 2026</span>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
