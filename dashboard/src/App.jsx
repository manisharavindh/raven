import React, { useState, useEffect } from 'react';
import { Play, Square, Activity } from 'lucide-react';
import SummaryPanel from './components/SummaryPanel';
import MapViewer from './components/MapViewer';
import EventList from './components/EventList';
import EvidenceViewer from './components/EvidenceViewer';

const App = () => {
  const [reportData, setReportData] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLiveRunning, setIsLiveRunning] = useState(false);

  const fetchTelemetryData = async () => {
    try {
      const [reportRes, detectionsRes] = await Promise.all([
        fetch('/data/report.json'),
        fetch('/data/detections.json')
      ]);
      
      if (reportRes.ok) {
        const report = await reportRes.json();
        setReportData(report);
      }
      
      if (detectionsRes.ok) {
        const dets = await detectionsRes.json();
        setEvents(dets);
      }
    } catch (err) {
      console.error("Failed to load RAVEN data:", err);
    } finally {
      setLoading(false);
    }
  };

  const checkLiveStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setIsLiveRunning(data.running);
      }
    } catch (err) {
      console.log("API not reachable yet.");
    }
  };

  useEffect(() => {
    fetchTelemetryData();
    checkLiveStatus();
    
    // Poll for status and new data every 5 seconds if live
    const interval = setInterval(() => {
      checkLiveStatus();
      if (isLiveRunning) {
        fetchTelemetryData();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isLiveRunning]);

  const [filterType, setFilterType] = useState('ALL');
  const [sortBy, setSortBy] = useState('NEWEST');

  const toggleLiveCamera = async () => {
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
      console.error("API Action failed:", err);
    }
  };

  const processedEvents = React.useMemo(() => {
    let result = [...events];
    
    if (filterType !== 'ALL') {
      result = result.filter(e => {
        if (filterType === 'CRITICAL') return e.type.toLowerCase() === 'pothole';
        if (filterType === 'WARNING') return e.type.toLowerCase().includes('crack');
        return true;
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'SEVERITY') {
        // Potholes rank higher than cracks, then confidence
        const scoreA = (a.type.toLowerCase() === 'pothole' ? 2 : 1) + a.confidence;
        const scoreB = (b.type.toLowerCase() === 'pothole' ? 2 : 1) + b.confidence;
        return scoreB - scoreA;
      }
      // NEWEST by default (assume higher event_id or sequence)
      return b.event_id > a.event_id ? 1 : -1;
    });

    return result;
  }, [events, filterType, sortBy]);

  const selectedEvent = events.find(e => e.event_id === selectedEventId);

  if (loading && !events.length) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Activity className="animate-spin" size={32} color="var(--accent-cyan)" />
          <h2 style={{ fontWeight: 300 }}>INITIALIZING RAVEN...</h2>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '15px', gap: '15px' }}>
      
      {/* Top Navigation / Control Bar */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 25px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ 
            fontWeight: 800,
            fontSize: '1.5em',
            letterSpacing: '2px',
            color: 'white',
            textShadow: '1px 1px 2px black'
          }}>
            RAVEN
          </div>
          <div style={{ height: '24px', width: '1px', background: 'var(--panel-border)' }}></div>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 300 }}>
            Intelligent Infrastructure Assessment
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {isLiveRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-red)', fontWeight: 600 }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-red)', boxShadow: '0 0 10px var(--accent-red)' }}></div>
              LIVE RECORDING
            </div>
          )}
          <button 
            className={isLiveRunning ? "btn-danger" : "btn-primary"} 
            onClick={toggleLiveCamera}
          >
            {isLiveRunning ? (
              <><Square size={18} /> STOP CAMERA</>
            ) : (
              <><Play size={18} /> START LIVE CAMERA</>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'flex', flex: 1, gap: '15px', overflow: 'hidden' }}>
        
        {/* Left Column: Stats & List */}
        <div style={{ width: '380px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <SummaryPanel report={reportData} />
          
          {/* List Controls */}
          <div className="glass-panel" style={{ padding: '10px', display: 'flex', gap: '10px', backgroundColor: '#d4d0c8' }}>
            <select 
              value={filterType} 
              onChange={e => setFilterType(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="ALL">ALL EVENTS</option>
              <option value="CRITICAL">CRITICAL (POTHOLES)</option>
              <option value="WARNING">WARNING (CRACKS)</option>
            </select>
            <select 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="NEWEST">NEWEST FIRST</option>
              <option value="SEVERITY">BY SEVERITY</option>
            </select>
          </div>

          <EventList 
            events={processedEvents} 
            selectedId={selectedEventId} 
            onSelect={setSelectedEventId} 
          />
        </div>

        {/* Middle Column: Map */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header" style={{ color: 'black' }}>
            <div><Activity size={18} /></div>
            <div>GEOSPATIAL MAP</div>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <MapViewer 
              events={processedEvents} 
              selectedId={selectedEventId}
              onSelect={setSelectedEventId} 
            />
          </div>
        </div>

        {/* Right Column: Evidence */}
        <div style={{ width: '420px', display: 'flex', flexDirection: 'column' }}>
          <EvidenceViewer event={selectedEvent} />
        </div>
        
      </div>
    </div>
  );
};

export default App;
