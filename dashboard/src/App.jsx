import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import MenuBar from './components/MenuBar';
import StatusBar from './components/StatusBar';
import DefectTable from './components/DefectTable';
import MapViewer from './components/MapViewer';
import EvidenceViewer from './components/EvidenceViewer';
import VideoFeed from './components/VideoFeed';
import useTelemetrySocket from './hooks/useTelemetrySocket';

const App = () => {
  const [reportData, setReportData] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [datasetMode, setDatasetMode] = useState('live'); // 'live' | 'demo'
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [maximizedWindow, setMaximizedWindow] = useState(null);

  // ===== MAP STATE =====
  const [mapMode, setMapMode] = useState('roads');
  const [damageViewEnabled, setDamageViewEnabled] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [debugAlignment, setDebugAlignment] = useState(false);

  // ===== RESIZER STATE =====
  const [leftWidth, setLeftWidth] = useState(() => parseInt(localStorage.getItem('ravenLeftWidth')) || 400);
  const [leftTopHeight, setLeftTopHeight] = useState(() => parseInt(localStorage.getItem('ravenLeftTopHeight')) || window.innerHeight / 2);
  const [rightTopHeight, setRightTopHeight] = useState(() => parseInt(localStorage.getItem('ravenRightTopHeight')) || window.innerHeight / 2);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingTop, setIsResizingTop] = useState(false);
  const [isResizingRightTop, setIsResizingRightTop] = useState(false);

  // ===== MODAL STATE =====
  const [activeModal, setActiveModal] = useState(null); // 'about' | 'shortcuts' | 'confirm-delete' | 'camera-picker'
  const [cameraInput, setCameraInput] = useState('0');

  useEffect(() => {
    localStorage.setItem('ravenLeftWidth', leftWidth);
    localStorage.setItem('ravenLeftTopHeight', leftTopHeight);
    localStorage.setItem('ravenRightTopHeight', rightTopHeight);
  }, [leftWidth, leftTopHeight, rightTopHeight]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingLeft) {
        setLeftWidth(Math.max(200, Math.min(e.clientX, window.innerWidth - 200)));
      }
      if (isResizingTop) {
        setLeftTopHeight(Math.max(100, Math.min(e.clientY - 22, window.innerHeight - 150)));
      }
      if (isResizingRightTop) {
        setRightTopHeight(Math.max(200, Math.min(e.clientY - 22, window.innerHeight - 150)));
      }
    };
    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingTop(false);
      setIsResizingRightTop(false);
    };

    if (isResizingLeft || isResizingTop || isResizingRightTop) {
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
  }, [isResizingLeft, isResizingTop, isResizingRightTop]);

  // ===== REAL-TIME TELEMETRY via WebSocket =====
  // Replaces the old 500ms HTTP polling loop. The server now pushes
  // only changed data over a persistent WebSocket connection.
  // Falls back to HTTP polling automatically if WebSocket fails.

  const handleDetections = useCallback((newDetections) => {
    setEvents(newDetections);
    setLoading(false);
  }, []);

  const handleReport = useCallback((newReport) => {
    setReportData(newReport);
    setLoading(false);
  }, []);

  const handleStatus = useCallback((newStatus) => {
    setPipelineStatus(newStatus);
    setIsLiveRunning(newStatus.running);
    setLoading(false);
  }, []);

  useTelemetrySocket({
    onDetections: (newDetections) => { if (datasetMode === 'live') handleDetections(newDetections); },
    onReport: (newReport) => { if (datasetMode === 'live') handleReport(newReport); },
    onStatus: (newStatus) => { if (datasetMode === 'live') handleStatus(newStatus); },
  });

  // Fetch static dataset for demo mode
  useEffect(() => {
    if (datasetMode === 'demo') {
      setIsLiveRunning(false);
      setPipelineStatus({ running: false, status: 'stopped', source_type: 'synthetic_demo', source_path: 'data/demo/coimbatore' });
      setReportData(null);
      
      fetch('/demo/coimbatore/detections.json')
        .then(res => res.json())
        .then(data => {
          setEvents(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load demo data:', err);
          setLoading(false);
        });
    } else {
      fetchTelemetryData();
    }
  }, [datasetMode]);

  // Manual refresh for menu action — triggers a one-shot HTTP fetch
  const fetchTelemetryData = useCallback(async () => {
    if (datasetMode === 'demo') {
      try {
        const res = await fetch('/demo/coimbatore/detections.json');
        if (res.ok) setEvents(await res.json());
      } catch (err) {
        console.error('Failed to reload demo data:', err);
      }
      return;
    }
    try {
      const [reportRes, detectionsRes] = await Promise.all([
        fetch('/data/report.json'),
        fetch('/data/detections.json'),
      ]);
      if (reportRes.ok) setReportData(await reportRes.json());
      if (detectionsRes.ok) setEvents(await detectionsRes.json());
    } catch (err) {
      console.error('Failed to load RAVEN data:', err);
    }
  }, [datasetMode]);

  const checkPipelineStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setPipelineStatus(data);
        setIsLiveRunning(data.running);
      }
    } catch {
      // API not reachable
    }
  }, []);

  // ===== FILTERING =====
  const filteredEvents = useMemo(() => {
    if (filterType === 'ALL') return events;
    if (filterType === 'CRITICAL') return events.filter(e => e.type.toLowerCase() === 'pothole');
    if (filterType === 'WARNING') return events.filter(e => e.type.toLowerCase().includes('crack'));
    return events;
  }, [events, filterType]);

  const selectedEvent = events.find(e => e.event_id === selectedEventId);

  // ===== PIPELINE CONTROL =====
  const startDetection = useCallback(async (videoPath) => {
    try {
      const res = await fetch(`/api/detect/start?video_path=${encodeURIComponent(videoPath)}`, { method: 'POST' });
      if (res.ok) {
        setIsLiveRunning(true);
        checkPipelineStatus();
      } else {
        const err = await res.json();
        console.error('Start detection failed:', err);
      }
    } catch (err) {
      console.error('Start detection request failed:', err);
    }
  }, [checkPipelineStatus]);

  const startLiveCamera = useCallback(async (camId = 0) => {
    try {
      const res = await fetch(`/api/live/start?camera=${encodeURIComponent(camId)}`, { method: 'POST' });
      if (res.ok) {
        setIsLiveRunning(true);
        checkPipelineStatus();
      } else {
        const err = await res.json();
        console.error('Start live failed:', err);
      }
    } catch (err) {
      console.error('Start live request failed:', err);
    }
  }, [checkPipelineStatus]);

  const stopPipeline = useCallback(async () => {
    try {
      await fetch('/api/detect/stop', { method: 'POST' });
      setIsLiveRunning(false);
      setTimeout(() => {
        fetchTelemetryData();
        checkPipelineStatus();
      }, 2000);
    } catch (err) {
      console.error('Stop pipeline failed:', err);
    }
  }, [fetchTelemetryData, checkPipelineStatus]);

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

  // ===== DELETE ALL DATA =====
  const deleteAllData = useCallback(async () => {
    try {
      const res = await fetch('/api/data/purge', { method: 'DELETE' });
      if (res.ok) {
        setEvents([]);
        setReportData(null);
        setSelectedEventId(null);
        setActiveModal(null);
      } else {
        console.error('Purge failed:', await res.text());
      }
    } catch (err) {
      console.error('Purge request failed:', err);
    }
  }, []);

  // ===== MENU ACTIONS =====
  const handleMenuAction = useCallback((action) => {
    switch (action) {
      case 'export-csv': exportCSV(); break;
      case 'export-json': exportJSON(); break;
      case 'refresh': fetchTelemetryData(); break;
      case 'set-dataset-live': setDatasetMode('live'); break;
      case 'set-dataset-demo': setDatasetMode('demo'); break;
      case 'filter-all': setFilterType('ALL'); break;
      case 'filter-potholes': setFilterType('CRITICAL'); break;
      case 'filter-cracks': setFilterType('WARNING'); break;
      case 'map-mode-points': setMapMode('points'); break;
      case 'map-mode-roads': setMapMode('roads'); break;
      case 'map-toggle-damage': setDamageViewEnabled(prev => !prev); break;
      case 'map-toggle-ranking': setShowRanking(prev => !prev); break;
      case 'map-toggle-debug': setDebugAlignment(prev => !prev); break;
      case 'start-detection':
        setShowVideoPicker(true);
        break;
      case 'start-live': 
        setActiveModal('camera-picker');
        break;
      case 'stop-pipeline': stopPipeline(); break;
      case 'delete-all-data':
        setActiveModal('confirm-delete');
        break;
      case 'show-shortcuts':
        setActiveModal('shortcuts');
        break;
      case 'about':
        setActiveModal('about');
        break;
      default: break;
    }
  }, [exportCSV, exportJSON, fetchTelemetryData, startLiveCamera, stopPipeline]);

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
  // Loading screen removed as requested

  // ===== MAIN LAYOUT =====
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', cursor: isResizingLeft ? 'col-resize' : (isResizingTop || isResizingRightTop) ? 'row-resize' : 'default' }}>

      {/* Menu Bar */}
      <MenuBar
        onAction={handleMenuAction}
        isLiveRunning={isLiveRunning}
        filterType={filterType}
        datasetMode={datasetMode}
        mapMode={mapMode}
        damageViewEnabled={damageViewEnabled}
        showRanking={showRanking}
        debugAlignment={debugAlignment}
      />

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left Column */}
        <div style={{ 
          width: maximizedWindow === 'defect-table' || maximizedWindow === 'evidence' ? '100%' : leftWidth, 
          display: (maximizedWindow && maximizedWindow !== 'defect-table' && maximizedWindow !== 'evidence') ? 'none' : 'flex',
          flexDirection: 'column', 
          flexShrink: 0 
        }}>
          
          {/* Top Left: Defect Table */}
          <div style={{ 
            height: maximizedWindow === 'defect-table' ? '100%' : leftTopHeight, 
            display: maximizedWindow === 'evidence' ? 'none' : 'flex',
            flexDirection: 'column', 
            flexShrink: 0 
          }}>
            <DefectTable
              events={filteredEvents}
              selectedId={selectedEventId}
              onSelect={setSelectedEventId}
              onRefresh={fetchTelemetryData}
              isMaximized={maximizedWindow === 'defect-table'}
              onMaximize={() => setMaximizedWindow(maximizedWindow === 'defect-table' ? null : 'defect-table')}
            />
          </div>

          {/* Horizontal Resizer */}
          {!maximizedWindow && (
            <div 
              className={`resizer-v ${isResizingTop ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); setIsResizingTop(true); }}
            />
          )}

          {/* Bottom Left: Evidence */}
          <div style={{ 
            flex: 1, 
            display: maximizedWindow === 'defect-table' ? 'none' : 'flex',
            flexDirection: 'column', 
            minHeight: 0 
          }}>
            <EvidenceViewer 
              event={selectedEvent} 
              isMaximized={maximizedWindow === 'evidence'}
              onMaximize={() => setMaximizedWindow(maximizedWindow === 'evidence' ? null : 'evidence')}
            />
          </div>

        </div>

        {/* Vertical Resizer */}
        {!maximizedWindow && (
          <div 
            className={`resizer-h ${isResizingLeft ? 'active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); setIsResizingLeft(true); }}
          />
        )}

        {/* Right Column: Video Feed + Map */}
        <div style={{ 
          flex: 1, 
          display: (maximizedWindow === 'defect-table' || maximizedWindow === 'evidence') ? 'none' : 'flex',
          flexDirection: 'column', 
          minWidth: 0 
        }}>

          {/* Video Feed Panel */}
          <div style={{ 
            height: maximizedWindow === 'video' ? '100%' : rightTopHeight, 
            display: maximizedWindow === 'map' ? 'none' : 'flex',
            flexDirection: 'column', 
            flexShrink: 0 
          }}>
            <VideoFeed
              isRunning={isLiveRunning}
              pipelineStatus={pipelineStatus}
              onStartDetect={startDetection}
              onStartLive={() => setActiveModal('camera-picker')}
              onStop={stopPipeline}
              externalShowPicker={showVideoPicker}
              onPickerClose={() => setShowVideoPicker(false)}
              isMaximized={maximizedWindow === 'video'}
              onMaximize={() => setMaximizedWindow(maximizedWindow === 'video' ? null : 'video')}
            />
          </div>

          {/* Horizontal Resizer */}
          {!maximizedWindow && (
            <div 
              className={`resizer-v ${isResizingRightTop ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); setIsResizingRightTop(true); }}
            />
          )}

          {/* Map Panel */}
          <div className="mac-window" style={{ 
            flex: 1, 
            display: maximizedWindow === 'video' ? 'none' : 'flex',
            flexDirection: 'column', 
            border: 'none' 
          }}>
            <div className="panel-header">
              <span>Map</span>
              <button 
                onClick={() => setMaximizedWindow(maximizedWindow === 'map' ? null : 'map')} 
                style={{ position: 'absolute', right: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                title={maximizedWindow === 'map' ? "Restore" : "Maximize"}
              >
                {maximizedWindow === 'map' ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <MapViewer
                events={filteredEvents}
                selectedId={selectedEventId}
                onSelect={setSelectedEventId}
                datasetMode={datasetMode}
                mapMode={mapMode}
                damageViewEnabled={damageViewEnabled}
                showRanking={showRanking}
                debugAlignment={debugAlignment}
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

      {activeModal === 'confirm-delete' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="mac-window" style={{ width: 380, boxShadow: '4px 4px 0px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div className="panel-header"><span>Delete All Data</span></div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 12, fontWeight: 'bold' }}>
                Are you sure you want to delete ALL data?
              </div>
              <div style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 11 }}>
                This will permanently remove all sessions, detections, evidence images, and reports. This action cannot be undone.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="mac-btn" onClick={() => setActiveModal(null)}>Cancel</button>
                <button className="mac-btn-danger" onClick={deleteAllData}>Delete Everything</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'camera-picker' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="mac-window" style={{ width: 300, boxShadow: '4px 4px 0px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div className="panel-header"><span>Select Camera</span></div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Enter camera index (e.g., 0 for default, 1 for external):
              </div>
              <input
                type="number"
                min="0"
                value={cameraInput}
                onChange={(e) => setCameraInput(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setActiveModal(null);
                    startLiveCamera(parseInt(cameraInput, 10) || 0);
                  }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button className="mac-btn" onClick={() => setActiveModal(null)}>Cancel</button>
                <button className="mac-btn" onClick={() => {
                  setActiveModal(null);
                  startLiveCamera(parseInt(cameraInput, 10) || 0);
                }}>Start</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
