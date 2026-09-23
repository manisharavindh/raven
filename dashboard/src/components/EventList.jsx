import React from 'react';
import { AlertCircle } from 'lucide-react';

const EventList = ({ events, selectedId, onSelect }) => {
  return (
    <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="panel-header"><div>INCIDENT LOG</div></div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {events.length === 0 ? (
          <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>NO ANOMALIES DETECTED.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {events.map((event) => {
              const isCritical = event.type.toLowerCase() === 'pothole';
              const colorVar = isCritical ? 'var(--accent-red)' : 'var(--accent-amber)';

              return (
                <li 
                  key={event.event_id}
                  className={`list-item ${selectedId === event.event_id ? 'selected' : ''}`}
                  onClick={() => onSelect(event.event_id)}
                >
                  <AlertCircle size={18} color={colorVar} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold' }}>
                      {event.event_id}
                    </div>
                    <div style={{ fontSize: '0.8em', color: 'var(--text-secondary)' }}>
                      TYPE: {event.type.toUpperCase()} | CONF: {(event.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default EventList;
