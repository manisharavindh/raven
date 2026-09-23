import React from 'react';

const StatusBar = ({ events, report, isLiveRunning }) => {
  const potholeCount = events.filter(e => e.type.toLowerCase() === 'pothole').length;
  const crackCount = events.filter(e => e.type.toLowerCase().includes('crack')).length;
  const totalCount = events.length;

  return (
    <div className="status-bar">
      <div className="status-bar-section">
        <span style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>●</span>
        <span>{potholeCount} Potholes</span>
      </div>
      <div className="status-bar-divider" />
      <div className="status-bar-section">
        <span style={{ color: 'var(--accent-amber)', fontWeight: 'bold' }}>●</span>
        <span>{crackCount} Cracks</span>
      </div>
      <div className="status-bar-divider" />
      <div className="status-bar-section">
        <span style={{ fontWeight: 'bold' }}>{totalCount} Total</span>
      </div>

      {report && (
        <>
          <div className="status-bar-divider" />
          <div className="status-bar-section">
            Frames: {report.surveyed_frames?.toLocaleString() || '—'}
          </div>
          <div className="status-bar-divider" />
          <div className="status-bar-section">
            Avg Conf: {report.average_confidence ? `${(report.average_confidence * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="status-bar-divider" />
          <div className="status-bar-section" style={{ color: 'var(--text-secondary)' }}>
            {report.timestamp || ''}
          </div>
        </>
      )}

      <div className="status-bar-right">
        {isLiveRunning && (
          <>
            <div className="live-dot" />
            <span style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>RECORDING</span>
          </>
        )}
      </div>
    </div>
  );
};

export default StatusBar;
