import React from 'react';
import { Activity, Camera, Target } from 'lucide-react';

const SummaryPanel = ({ report }) => {
  if (!report) {
    return <div className="glass-panel"><div className="panel-header">STATUS: AWAITING TELEMETRY</div></div>;
  }

  const StatBox = ({ label, value, icon: Icon, color }) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--panel-border)' }}>
      <div style={{ padding: '0 15px', color: color }}>
        <Icon size={24} />
      </div>
      <div>
        <div style={{ fontSize: '0.8em', color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{value}</div>
      </div>
    </div>
  );

  return (
    <div className="glass-panel" style={{ flexShrink: 0 }}>
      <div className="panel-header">SYSTEM DIAGNOSTICS</div>
      <div style={{ padding: '0 10px' }}>
        <StatBox 
          label="TOTAL DEFECTS LOGGED" 
          value={report.total_defects} 
          icon={Activity} 
          color="var(--accent-amber)" 
        />
        <StatBox 
          label="FRAMES ANALYZED" 
          value={report.surveyed_frames} 
          icon={Camera} 
          color="var(--accent-cyan)" 
        />
        <StatBox 
          label="AVG CONFIDENCE" 
          value={`${(report.average_confidence * 100).toFixed(1)}%`} 
          icon={Target} 
          color="var(--text-primary)" 
        />
      </div>
      <div style={{ padding: '10px', fontSize: '0.8em', color: 'var(--text-secondary)', textAlign: 'center' }}>
        TS: {report.timestamp}
      </div>
    </div>
  );
};

export default SummaryPanel;
