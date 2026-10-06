import React, { useState, useEffect, useRef } from 'react';
import useVideoSocket from '../hooks/useVideoSocket';
import { Maximize2, Minimize2 } from 'lucide-react';

const VideoFeed = ({ isRunning, pipelineStatus, onStartDetect, onStartLive, onStop, externalShowPicker, onPickerClose, isMaximized, onMaximize }) => {
  const [videos, setVideos] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  // WebSocket video feed — replaces MJPEG <img> with canvas rendering
  useVideoSocket({ canvasRef, enabled: isRunning });

  // Sync external picker trigger from menu bar
  useEffect(() => {
    if (externalShowPicker) {
      setShowPicker(true);
    }
  }, [externalShowPicker]);

  // Notify parent when picker closes
  const closePicker = () => {
    setShowPicker(false);
    if (onPickerClose) onPickerClose();
  };

  // Fetch video list when picker opens
  useEffect(() => {
    if (showPicker) {
      fetch('/api/videos')
        .then(r => r.json())
        .then(setVideos)
        .catch(() => setVideos([]));
    }
  }, [showPicker]);

  // Keyboard navigation for video picker
  useEffect(() => {
    if (!showPicker || videos.length === 0) return;

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input (though there are none in this modal currently)
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = videos.findIndex(v => v.filename === selectedVideo?.filename);
        const nextIndex = currentIndex < videos.length - 1 ? currentIndex + 1 : 0;
        setSelectedVideo(videos[nextIndex]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = videos.findIndex(v => v.filename === selectedVideo?.filename);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : videos.length - 1;
        setSelectedVideo(videos[prevIndex]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedVideo && !starting) {
          // Trigger the detection start
          setStarting(true);
          onStartDetect(selectedVideo.path)
            .then(() => {
              closePicker();
              setSelectedVideo(null);
            })
            .finally(() => setStarting(false));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPicker, videos, selectedVideo, starting, onStartDetect]);

  const handleStartDetect = async () => {
    if (!selectedVideo) return;
    setStarting(true);
    try {
      await onStartDetect(selectedVideo.path);
      closePicker();
      setSelectedVideo(null);
    } finally {
      setStarting(false);
    }
  };

  const handleStartLive = () => {
    onStartLive();
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/videos/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const uploaded = await res.json();
        // Refresh list
        const listRes = await fetch('/api/videos');
        if (listRes.ok) setVideos(await listRes.json());
        setSelectedVideo(uploaded);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ===== FEED IS ACTIVE =====
  if (isRunning) {
    return (
      <div className="mac-window" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <span>
            {pipelineStatus?.source_type === 'live_camera' ? 'Live Camera' : 'Video Detection'}
            {' — '}
            <span style={{ fontWeight: 'normal', fontSize: 11 }}>
              {pipelineStatus?.source_path || ''}
            </span>
          </span>
          {onMaximize && (
            <button 
              onClick={onMaximize} 
              style={{ position: 'absolute', right: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', fontSize: 11 }}>
              PROCESSING{pipelineStatus?.source_type === 'live_camera' ? ' LIVE' : ''}
            </span>
          </div>
          <button className="mac-btn-danger" onClick={onStop} style={{ padding: '2px 12px', fontSize: 11 }}>
            Stop
          </button>
        </div>

        {/* WebSocket Video Canvas — zero-flicker, double-buffered by browser */}
        <div style={{
          flex: 1,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: pipelineStatus?.source_path === 'camera:0' ? 'scaleX(-1)' : 'none',
            }}
          />
        </div>
      </div>
    );
  }

  // ===== IDLE — show controls =====
  return (
    <div className="mac-window" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span>Video Feed</span>
        {onMaximize && (
          <button 
            onClick={onMaximize} 
            style={{ position: 'absolute', right: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        )}
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 30,
        background: '#1a1a1a',
      }}>
        <div style={{ color: '#888', fontSize: 48, opacity: 0.3, fontFamily: 'var(--font-mono)' }}>[ ]</div>
        {/* <div style={{ color: '#888', textAlign: 'center', maxWidth: 280 }}>
          Start a detection pipeline to see the live video feed here.
        </div> */}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="mac-btn" onClick={() => setShowPicker(true)}
            style={{ padding: '6px 18px', fontSize: 12 }}>
            Run Detection…
          </button>
          <button className="mac-btn" onClick={handleStartLive}
            style={{ padding: '6px 18px', fontSize: 12 }}
            disabled={starting}>
            Start Live Camera
          </button>
        </div>

        {/* Show last run status */}
        {pipelineStatus && pipelineStatus.status !== 'idle' && !isRunning && (
          <div style={{
            marginTop: 12,
            padding: '6px 14px',
            background: pipelineStatus.status === 'completed' ? '#1a3a1a' : '#3a1a1a',
            border: `1px solid ${pipelineStatus.status === 'completed' ? '#2a5a2a' : '#5a2a2a'}`,
            borderRadius: 4,
            color: '#ccc',
            fontSize: 11,
          }}>
            Last run: <strong>{pipelineStatus.status}</strong>
            {pipelineStatus.frames_processed > 0 && ` — ${pipelineStatus.frames_processed} frames`}
            {pipelineStatus.error && <div style={{ color: '#ff6666', marginTop: 4 }}>{pipelineStatus.error}</div>}
          </div>
        )}
      </div>

      {/* ===== VIDEO PICKER MODAL ===== */}
      {showPicker && (
        <div className="modal-overlay" onClick={() => closePicker()}>
          <div className="mac-window" style={{ width: 450, maxHeight: '70vh', boxShadow: '4px 4px 0px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div className="panel-header"><span>Select Video</span></div>

            {/* Upload bar */}
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Videos in <code>data/input/</code>
              </span>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp4,.avi,.mov,.mkv,.webm,.m4v"
                  onChange={handleUpload}
                  style={{ display: 'none' }}
                />
                <button className="mac-btn" onClick={() => fileInputRef.current?.click()}
                  disabled={uploading} style={{ fontSize: 11 }}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>

            {/* Video list */}
            <div style={{ overflow: 'auto', maxHeight: 300 }}>
              {videos.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No videos found. Upload one to get started.
                </div>
              ) : (
                <table className="defect-table" style={{ tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '60%' }}>Filename</th>
                      <th style={{ width: '20%' }}>Size</th>
                      <th style={{ width: '20%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {videos.map(v => (
                      <tr
                        key={v.filename}
                        className={selectedVideo?.filename === v.filename ? 'selected' : ''}
                        onClick={() => setSelectedVideo(v)}
                      >
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v.filename}</td>
                        <td style={{ fontSize: 11 }}>{v.size_mb} MB</td>
                        <td>
                          {selectedVideo?.filename === v.filename && (
                            <span style={{ color: 'var(--selection-text)', fontWeight: 'bold' }}>✓</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--mac-shadow)' }}>
              <button className="mac-btn" onClick={() => closePicker()}>Cancel</button>
              <button className="mac-btn" onClick={handleStartDetect}
                disabled={!selectedVideo || starting}
                style={{ fontWeight: 'bold' }}>
                {starting ? 'Starting…' : 'Start Detection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoFeed;
