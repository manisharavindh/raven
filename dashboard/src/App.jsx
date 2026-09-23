import React, { useState, useEffect, useCallback, useMemo } from 'react';
import MenuBar from './components/MenuBar';
import StatusBar from './components/StatusBar';
import DefectTable from './components/DefectTable';
import MapViewer from './components/MapViewer';
import EvidenceViewer from './components/EvidenceViewer';

const App = () => {
  const [reportData, setReportData] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [filterType, setFilterType] = useState('ALL');

  // ===== RESIZER STATE =====
  const [leftWidth, setLeftWidth] = useState(() => parseInt(localStorage.getItem('ravenLeftWidth')) || 400);
  const [leftTopHeight, setLeftTopHeight] = useState(() => parseInt(localStorage.getItem('ravenLeftTopHeight')) || window.innerHeight / 2);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingTop, setIsResizingTop] = useState(false);

  // ===== MODAL STATE =====
  const [activeModal, setActiveModal] = useState(null); // 'about' | 'shortcuts'

  useEffect(() => {
    localStorage.setItem('ravenLeftWidth', leftWidth);
    localStorage.setItem('ravenLeftTopHeight', leftTopHeight);
  }, [leftWidth, leftTopHeight]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingLeft) {
        setLeftWidth(Math.max(200, Math.min(e.clientX, window.innerWidth - 200)));
      }
      if (isResizingTop) {
        setLeftTopHeight(Math.max(100, Math.min(e.clientY - 22, window.innerHeight - 150)));
      }
    };
    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingTop(false);
    };

    if (isResizingLeft || isResizingTop) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingTop]);

  // ===== DATA FETCHING =====
  const fetchTelemetryData = useCallback(async () => {
    try {
      const [reportRes, detectionsRes] = await Promise.all([
        fetch('/data/report.json'),
        fetch('/data/detections.json'),
      ]);
      if (reportRes.ok) setReportData(await reportRes.json());
      if (detectionsRes.ok) setEvents(await detectionsRes.json());
    } catch (err) {
      console.error('Failed to load RAVEN data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkLiveStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setIsLiveRunning(data.running);
      }
    } catch {
      // API not reachable
    }
  }, []);

  useEffect(() => {
    fetchTelemetryData();
    checkLiveStatus();
    const interval = setInterval(() => {
      checkLiveStatus();
      if (isLiveRunning) fetchTelemetryData();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLiveRunning, fetchTelemetryData, checkLiveStatus]);

  // ===== FILTERING =====
  const filteredEvents = useMemo(() => {
    if (filterType === 'ALL') return events;
    if (filterType === 'CRITICAL') return events.filter(e => e.type.toLowerCase() === 'pothole');
    if (filterType === 'WARNING') return events.filter(e => e.type.toLowerCase().includes('crack'));
    return events;
  }, [events, filterType]);

  const selectedEvent = events.find(e => e.event_id === selectedEventId);

  // ===== CAMERA CONTROL =====
  const toggleLiveCamera = useCallback(async () => {
    try {
      if (isLiveRunning) {
        await fetch('/api/live/stop', { method: 'POST' });
        setIsLiveRunning(false);
        setTimeout(fetchTelemetryData, 2000);
      } else {
        await fetch('/api/live/start', { method: 'POST' });
        setIsLiveRunning(true);
      }
    } catch (err) {
      console.error('API Action failed:', err);
    }
  }, [isLiveRunning, fetchTelemetryData]);

  // ===== CSV EXPORT =====
  const exportCSV = useCallback(() => {
    if (events.length === 0) return;
    const headers = ['event_id', 'type', 'confidence', 'latitude', 'longitude', 'first_frame', 'last_frame'];
    const rows = events.map(e =>
      headers.map(h => {
        const val = e[h];
        if (typeof val === 'number') return val;
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven_defects_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  // ===== JSON EXPORT =====
  const exportJSON = useCallback(() => {
    if (events.length === 0) return;
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven_defects_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  // ===== MENU ACTIONS =====
  const handleMenuAction = useCallback((action) => {
    switch (action) {
      case 'export-csv': exportCSV(); break;
      case 'export-json': exportJSON(); break;
      case 'refresh': fetchTelemetryData(); break;
      case 'filter-all': setFilterType('ALL'); break;
      case 'filter-potholes': setFilterType('CRITICAL'); break;
      case 'filter-cracks': setFilterType('WARNING'); break;
      case 'toggle-camera': toggleLiveCamera(); break;
      case 'show-shortcuts':
        setActiveModal('shortcuts');
        break;
      case 'about':
        setActiveModal('about');
        break;
      default: break;
    }
  }, [exportCSV, exportJSON, fetchTelemetryData, toggleLiveCamera]);

  // ===== GLOBAL KEYBOARD SHORTCUTS =====
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === '1') { e.preventDefault(); setFilterType('ALL'); }
      if (e.key === '2') { e.preventDefault(); setFilterType('CRITICAL'); }
      if (e.key === '3') { e.preventDefault(); setFilterType('WARNING'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ===== LOADING STATE =====
  if (loading && !events.length) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-main)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: 'white' }}>RAVEN</div>
          <div style={{ color: 'white' }}>Initializing...</div>
        </div>
      </div>
    );
  }

  // ===== MAIN LAYOUT =====
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', cursor: isResizingLeft ? 'col-resize' : isResizingTop ? 'row-resize' : 'default' }}>

      {/* Menu Bar */}
      <MenuBar
        onAction={handleMenuAction}
        isLiveRunning={isLiveRunning}
        filterType={filterType}
      />

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left Column */}
        <div style={{ width: leftWidth, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          
          {/* Top Left: Defect Table */}
          <div style={{ height: leftTopHeight, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <DefectTable
              events={filteredEvents}
              selectedId={selectedEventId}
              onSelect={setSelectedEventId}
            />
          </div>

          {/* Horizontal Resizer */}
          <div 
            className={`resizer-v ${isResizingTop ? 'active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); setIsResizingTop(true); }}
          />

          {/* Bottom Left: Evidence */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <EvidenceViewer event={selectedEvent} />
          </div>

        </div>

        {/* Vertical Resizer */}
        <div 
          className={`resizer-h ${isResizingLeft ? 'active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); setIsResizingLeft(true); }}
        />

        {/* Right: Map */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="mac-window" style={{ flex: 1, display: 'flex', flexDirection: 'column', border: 'none' }}>
            <div className="panel-header"><span>Map</span></div>
            <div style={{ flex: 1, position: 'relative' }}>
              <MapViewer
                events={filteredEvents}
                selectedId={selectedEventId}
                onSelect={setSelectedEventId}
              />
            </div>
          </div>
        </div>

      </div>

      {/* Status Bar */}
      <StatusBar
        events={events}
        report={reportData}
        isLiveRunning={isLiveRunning}
      />

      {/* Global Modals */}
      {activeModal === 'about' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="mac-window" style={{ width: 350, boxShadow: '4px 4px 0px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div className="panel-header"><span>About RAVEN</span></div>
            <div style={{ padding: 20, textAlign: 'center' }}>
              <h2 style={{ marginBottom: 10 }}>RAVEN v3.0</h2>
              <div style={{ marginBottom: 5 }}>Road Assessment & Visual Evidence Network</div>
              <div style={{ color: 'var(--text-secondary)' }}>Intelligent Infrastructure Damage Detection System</div>
              <div style={{ marginTop: 20 }}>
                <button className="mac-btn" onClick={() => setActiveModal(null)}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'shortcuts' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="mac-window" style={{ width: 400, boxShadow: '4px 4px 0px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div className="panel-header"><span>Keyboard Shortcuts</span></div>
            <div style={{ padding: '10px 20px' }}>
              <table style={{ width: '100%', textAlign: 'left', borderSpacing: '0 8px' }}>
                <tbody>
                  <tr><td style={{ fontWeight: 'bold', width: 60 }}>↑ / ↓</td><td>Navigate defect list</td></tr>
                  <tr><td style={{ fontWeight: 'bold' }}>Enter</td><td>Open evidence full-screen</td></tr>
                  <tr><td style={{ fontWeight: 'bold' }}>Escape</td><td>Close modal</td></tr>
                  <tr><td style={{ fontWeight: 'bold' }}>F</td><td>Focus search box</td></tr>
                  <tr><td style={{ fontWeight: 'bold' }}>1</td><td>Filter: All defects</td></tr>
                  <tr><td style={{ fontWeight: 'bold' }}>2</td><td>Filter: Potholes only</td></tr>
                  <tr><td style={{ fontWeight: 'bold' }}>3</td><td>Filter: Cracks only</td></tr>
                </tbody>
              </table>
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <button className="mac-btn" onClick={() => setActiveModal(null)}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
