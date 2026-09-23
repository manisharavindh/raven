import React, { useState } from 'react';
import { Maximize2, X, Copy, Check } from 'lucide-react';

const EvidenceViewer = ({ event }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Close modal on Escape
  React.useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
      // Enter opens modal if event is selected
      if (e.key === 'Enter' && event && !isModalOpen && document.activeElement?.tagName !== 'INPUT') {
        setIsModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isModalOpen, event]);

  const copyCoords = () => {
    if (!event) return;
    navigator.clipboard.writeText(`${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!event) {
    return (
      <div className="mac-window" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header"><span>Evidence</span></div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', padding: 20 }}>
          Select a defect to view evidence.
        </div>
      </div>
    );
  }

  const isCritical = event.type.toLowerCase() === 'pothole';

  return (
    <>
      <div className="mac-window" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header"><span>Evidence — {event.event_id}</span></div>

        <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0 }}>
          {/* Evidence Image */}
          <div
            onClick={() => setIsModalOpen(true)}
            style={{
              width: '40%',
              backgroundImage: `url(/${event.evidence})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              position: 'relative',
              cursor: 'pointer',
              borderRight: '1px solid var(--mac-shadow)',
            }}
          >
            <div style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(0,0,0,0.5)', borderRadius: 2, padding: '2px 4px',
              display: 'flex', alignItems: 'center',
            }}>
              <Maximize2 size={12} color="white" />
            </div>
          </div>

          {/* Metadata */}
          <div style={{ padding: '8px 10px', width: '60%', overflowY: 'auto' }}>

            {/* Severity Badge */}
            <div style={{ marginBottom: 8 }}>
              <span className={`badge ${isCritical ? 'badge-critical' : 'badge-warning'}`} style={{ fontSize: 11 }}>
                {isCritical ? '⚠ CRITICAL' : '⚠ WARNING'}
              </span>
            </div>

            <div className="evidence-meta-row">
              <span className="evidence-meta-label">Type</span>
              <span style={{ fontWeight: 'bold' }}>{event.type.toUpperCase()}</span>
            </div>

            <div className="evidence-meta-row">
              <span className="evidence-meta-label">Confidence</span>
              <span className="conf-bar">
                <div className="conf-bar-fill" style={{
                  width: `${event.confidence * 100}%`,
                  backgroundColor: isCritical ? 'var(--accent-red)' : 'var(--accent-amber)',
                }} />
              </span>
              <span style={{ fontWeight: 'bold' }}>{(event.confidence * 100).toFixed(1)}%</span>
            </div>

            <div className="evidence-meta-row">
              <span className="evidence-meta-label">Coordinates</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                {event.latitude.toFixed(6)}, {event.longitude.toFixed(6)}
              </span>
              <button className="copy-btn" onClick={copyCoords} title="Copy to clipboard">
                {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            </div>

            <div className="evidence-meta-row">
              <span className="evidence-meta-label">Frames</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                {event.first_frame} → {event.last_frame} ({event.last_frame - event.first_frame + 1} frames)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Full-Screen Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="mac-window" style={{ boxShadow: '4px 4px 0px rgba(0,0,0,0.5)', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <span>Evidence: {event.event_id}</span>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ 
                  position: 'absolute', right: 6, 
                  background: 'var(--mac-light)', border: '1px solid var(--mac-shadow)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  width: 14, height: 14, padding: 0, cursor: 'pointer' 
                }}
              >
                 <X size={10} color="black" />
              </button>
            </div>
            <div style={{ overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--mac-black)' }}>
              <img src={`/${event.evidence}`} alt={event.event_id} style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 24px)', border: 'none', boxShadow: 'none' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EvidenceViewer;
