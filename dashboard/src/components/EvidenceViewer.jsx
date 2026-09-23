import React, { useState } from 'react';
import { Camera, MapPin, Tag, Maximize2, X } from 'lucide-react';

const EvidenceViewer = ({ event }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!event) {
    return (
      <div className="glass-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-secondary)' }}>AWAITING EVENT SELECTION...</div>
      </div>
    );
  }

  const isCritical = event.type.toLowerCase() === 'pothole';
  const colorVar = isCritical ? 'var(--accent-red)' : 'var(--accent-amber)';

  return (
    <>
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header" style={{ color: 'black' }}>
          <div>EVIDENCE LOG: {event.event_id}</div>
        </div>
        
        {/* Image Container */}
        <div 
          onClick={() => setIsModalOpen(true)}
          style={{ 
            height: '250px', 
            borderBottom: '1px solid var(--panel-border)',
            backgroundImage: `url(/${event.evidence})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
            cursor: 'pointer'
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
          }}></div>
          
          <div style={{
            position: 'absolute',
            top: '10px', right: '10px',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: '5px',
            borderRadius: '50%',
            display: 'flex'
          }}>
            <Maximize2 size={16} color="white" />
          </div>
          
          <div style={{
            position: 'absolute',
            bottom: '10px', right: '10px',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: '2px 8px',
            border: `1px solid ${colorVar}`,
            color: colorVar,
            fontSize: '0.8em',
            fontWeight: 'bold'
          }}>
            REC
          </div>
        </div>

        {/* Metadata */}
        <div style={{ padding: '15px', flex: 1, overflowY: 'auto' }}>
          <div style={{ marginBottom: '15px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em' }}>CLASSIFICATION</div>
            <div style={{ fontSize: '1.2em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', color: colorVar }}>
              <Tag size={16} />
              {event.type.toUpperCase()}
            </div>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em' }}>CONFIDENCE RATING</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--panel-border)' }}>
                <div style={{ 
                  width: `${event.confidence * 100}%`, 
                  height: '100%', 
                  backgroundColor: colorVar 
                }}></div>
              </div>
              <div>{(event.confidence * 100).toFixed(1)}%</div>
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em' }}>GEOSPATIAL COORDINATES</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}>
              <MapPin size={16} color="var(--accent-cyan)" />
              {event.latitude.toFixed(6)}, {event.longitude.toFixed(6)}
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8em' }}>FRAME PERSISTENCE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}>
              <Camera size={16} />
              {event.first_frame} &rarr; {event.last_frame} ({(event.last_frame - event.first_frame + 1)} frames)
            </div>
          </div>
        </div>
      </div>

      {/* Full-Screen Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }} onClick={() => setIsModalOpen(false)}>
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsModalOpen(false); }}
              style={{
                position: 'absolute', top: '-40px', right: 0,
                background: 'none', border: 'none', color: 'white', cursor: 'pointer'
              }}
            >
              <X size={32} />
            </button>
            <img 
              src={`/${event.evidence}`} 
              alt={event.event_id} 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '85vh', 
                border: `2px solid ${colorVar}`,
                boxShadow: `0 0 30px ${colorVar}40`,
                borderRadius: '8px' 
              }} 
            />
          </div>
        </div>
      )}
    </>
  );
};

export default EvidenceViewer;
