import { useState, useEffect, useRef } from 'react';
import { Mic, Square, AlertTriangle, CheckCircle, Lightbulb } from 'lucide-react';

// Stat orb - bigger blob style (clickable)
function StatOrb({ label, count, color, icon: Icon, isActive, onClick }) {
  const [showPulse, setShowPulse] = useState(false);
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (count > prevCountRef.current) {
      setShowPulse(true);
      const timer = setTimeout(() => setShowPulse(false), 1500);
      prevCountRef.current = count;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = count;
  }, [count]);

  return (
    <div
      className="flex flex-col items-center cursor-pointer group"
      onClick={onClick}
    >
      <div className="relative transition-transform group-hover:scale-105">
        <svg width="140" height="140" viewBox="0 0 200 200" className="overflow-visible">
          {/* Pulse ring on count change */}
          {showPulse && (
            <circle
              cx="100"
              cy="100"
              r="85"
              fill="none"
              stroke={color}
              strokeWidth="2"
              className="animate-ping"
              style={{ transformOrigin: 'center' }}
            />
          )}
          {/* Base circle */}
          <circle
            cx="100"
            cy="100"
            r="85"
            fill="none"
            stroke={color}
            strokeWidth="0.5"
            opacity="0.6"
            className="transition-all group-hover:opacity-100 group-hover:stroke-2"
          />
          {/* Inner glow */}
          <circle
            cx="100"
            cy="100"
            r="70"
            fill={color}
            opacity="0.05"
            className="transition-opacity group-hover:opacity-10"
          />
        </svg>

        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="w-8 h-8 mb-1" style={{ color }} />
          <span className="text-4xl font-bold" style={{ color }}>{count}</span>
        </div>
      </div>
      <span className="text-sm font-medium text-gray-500 mt-2 group-hover:text-gray-700">{label}</span>
    </div>
  );
}

// Main fluid recording orb component
export default function FluidRecordingOrb({
  isRecording,
  onStartRecording,
  onStopRecording,
  recordingTime,
  audioLevel = 0,
  openPoints = 0,
  closedPoints = 0,
  discoveredPoints = 0,
  formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`,
  onOpenPointsClick,
  onClosedPointsClick,
  onDiscoveriesClick
}) {
  const containerRef = useRef(null);

  return (
    <div ref={containerRef} className={`relative w-full h-full transition-colors duration-500 ${isRecording ? 'bg-red-50' : ''}`}>

      {/* Prominent RECORDING banner */}
      {isRecording && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-red-600 text-white px-6 py-3 rounded-full shadow-lg recording-banner">
          <span className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
          </span>
          <span className="text-xl font-bold tracking-wider">RECORDING</span>
        </div>
      )}

      {/* Recording orb on center-left - EXTREME ORGANIC BLOB */}
      <div className="absolute left-[15%] top-1/2 -translate-y-1/2">
        <div className="relative cursor-pointer" onClick={isRecording ? onStopRecording : onStartRecording}>
          <svg width="420" height="420" viewBox="0 0 200 200" className="overflow-visible">
            <defs>
              {/* Gooey filter for extreme organic feel */}
              <filter id="goo-extreme" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -12" result="goo" />
              </filter>
              <filter id="goo-soft" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
              </filter>
            </defs>

            {/* Amoeba-like pulsating blobs - only when recording */}
            {isRecording && [...Array(6)].map((_, i) => (
              <path
                key={i}
                d="M100,8 C130,5 165,25 185,60 C200,95 195,135 170,165 C145,190 120,200 85,195 C50,190 20,160 10,120 C0,80 15,45 45,25 C75,5 70,11 100,8"
                fill="none"
                stroke="#ef4444"
                strokeWidth="0.5"
                className={`amoeba-pulse-${i % 3}`}
                style={{
                  transformOrigin: 'center',
                  animationDelay: `${i * 0.5}s`,
                  opacity: 0
                }}
              />
            ))}

            {/* Outer amoeba blob - wild morphing */}
            <path
              d="M100,5 C140,0 175,20 190,55 C205,90 195,140 165,175 C135,205 95,210 55,185 C20,160 0,115 10,70 C20,30 60,10 100,5"
              fill="none"
              stroke={isRecording ? "#ef4444" : "#8b5cf6"}
              strokeWidth="0.6"
              opacity="0.8"
              className={isRecording ? "amoeba-recording-1" : "amoeba-idle-1"}
              filter="url(#goo-extreme)"
            />

            {/* Second layer - offset rhythm */}
            <path
              d="M100,15 C135,12 168,35 180,65 C195,100 185,145 155,172 C125,200 80,205 48,178 C18,152 5,108 15,68 C28,30 65,18 100,15"
              fill="none"
              stroke={isRecording ? "#ef4444" : "#8b5cf6"}
              strokeWidth="0.5"
              opacity="0.5"
              className={isRecording ? "amoeba-recording-2" : "amoeba-idle-2"}
              filter="url(#goo-soft)"
            />

            {/* Third layer - counter rhythm */}
            <path
              d="M100,28 C130,25 158,45 170,72 C185,102 175,138 150,162 C122,188 82,190 55,165 C28,140 18,105 28,72 C40,42 70,31 100,28"
              fill="none"
              stroke={isRecording ? "#ef4444" : "#8b5cf6"}
              strokeWidth="0.4"
              opacity="0.35"
              className={isRecording ? "amoeba-recording-3" : "amoeba-idle-3"}
            />

            {/* Inner dancing blob */}
            <path
              d="M100,42 C125,40 148,55 158,78 C170,105 160,135 140,155 C118,175 85,178 62,158 C40,138 32,108 42,80 C54,52 75,44 100,42"
              fill="none"
              stroke={isRecording ? "#ef4444" : "#8b5cf6"}
              strokeWidth="0.3"
              opacity="0.2"
              className={isRecording ? "amoeba-recording-4" : "amoeba-idle-4"}
            />

            {/* Floating nucleus blobs - when idle */}
            {!isRecording && (
              <>
                <circle cx="70" cy="70" r="4" fill="#8b5cf6" opacity="0.15" className="nucleus-float-1" />
                <circle cx="130" cy="80" r="3" fill="#8b5cf6" opacity="0.12" className="nucleus-float-2" />
                <circle cx="85" cy="130" r="3.5" fill="#8b5cf6" opacity="0.1" className="nucleus-float-3" />
                <circle cx="120" cy="125" r="2.5" fill="#8b5cf6" opacity="0.12" className="nucleus-float-4" />
              </>
            )}

            {/* Pulsing core glow when recording */}
            {isRecording && (
              <>
                <ellipse cx="100" cy="100" rx="55" ry="52" fill="#ef4444" opacity="0.08" className="core-pulse-1" />
                <ellipse cx="102" cy="98" rx="40" ry="38" fill="#ef4444" opacity="0.05" className="core-pulse-2" />
              </>
            )}
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {isRecording ? (
              <>
                <Square className="w-20 h-20 text-red-600 mb-3 drop-shadow-lg" fill="#ef4444" />
                <span className="text-red-600 text-6xl font-bold tracking-wider drop-shadow-md">{formatTime(recordingTime)}</span>
                <span className="text-red-500 text-lg font-semibold mt-2">Tap to Stop</span>
              </>
            ) : (
              <>
                <Mic className="w-24 h-24 text-purple-500 mb-3" />
                <span className="text-purple-600 text-2xl font-medium">Record</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats orbs in true center of screen */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex flex-col items-center gap-4">
          <StatOrb label="Open Points" count={openPoints} color="#ef4444" icon={AlertTriangle} isActive={isRecording} onClick={onOpenPointsClick} />
          <StatOrb label="Closed Points" count={closedPoints} color="#22c55e" icon={CheckCircle} isActive={isRecording} onClick={onClosedPointsClick} />
          <StatOrb label="Discoveries" count={discoveredPoints} color="#f59e0b" icon={Lightbulb} isActive={isRecording} onClick={onDiscoveriesClick} />
        </div>
      </div>
    </div>
  );
}
