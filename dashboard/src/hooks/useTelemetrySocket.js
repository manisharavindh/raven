import { useEffect, useRef, useCallback } from 'react';

/**
 * useTelemetrySocket — Replaces HTTP polling with a persistent WebSocket
 * connection to /ws/telemetry for real-time dashboard updates.
 *
 * The server only pushes data when it has actually changed (delta updates),
 * so the React state is only updated when there's genuinely new information.
 * This eliminates the flicker/re-render problem caused by 500ms polling.
 *
 * Falls back to HTTP polling if WebSocket connection fails.
 */
const useTelemetrySocket = ({ onDetections, onReport, onStatus }) => {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const isMounted = useRef(true);
  const fallbackInterval = useRef(null);

  // Stable callback refs to avoid re-connecting on every render
  const onDetectionsRef = useRef(onDetections);
  const onReportRef = useRef(onReport);
  const onStatusRef = useRef(onStatus);
  onDetectionsRef.current = onDetections;
  onReportRef.current = onReport;
  onStatusRef.current = onStatus;

  const startFallbackPolling = useCallback(() => {
    if (fallbackInterval.current) return;
    console.log('[Telemetry] Falling back to HTTP polling');
    fallbackInterval.current = setInterval(async () => {
      try {
        const [detRes, repRes, statRes] = await Promise.all([
          fetch('/data/detections.json'),
          fetch('/data/report.json'),
          fetch('/api/status'),
        ]);
        if (detRes.ok) onDetectionsRef.current(await detRes.json());
        if (repRes.ok) onReportRef.current(await repRes.json());
        if (statRes.ok) onStatusRef.current(await statRes.json());
      } catch {
        // silently fail
      }
    }, 500);
  }, []);

  const stopFallbackPolling = useCallback(() => {
    if (fallbackInterval.current) {
      clearInterval(fallbackInterval.current);
      fallbackInterval.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!isMounted.current) return;

    // Determine WebSocket URL dynamically
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Telemetry] WebSocket connected');
        stopFallbackPolling();
        // Clear any pending reconnect
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'telemetry') {
            if (msg.detections !== undefined) onDetectionsRef.current(msg.detections);
            if (msg.report !== undefined) onReportRef.current(msg.report);
            if (msg.status !== undefined) onStatusRef.current(msg.status);
          }
        } catch (e) {
          console.warn('[Telemetry] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[Telemetry] WebSocket closed, reconnecting in 2s...');
        wsRef.current = null;
        startFallbackPolling();
        if (isMounted.current) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };

      ws.onerror = (err) => {
        console.warn('[Telemetry] WebSocket error:', err);
        ws.close();
      };
    } catch {
      // WebSocket construction failed — use fallback
      startFallbackPolling();
      reconnectTimer.current = setTimeout(connect, 5000);
    }
  }, [startFallbackPolling, stopFallbackPolling]);

  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      stopFallbackPolling();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, stopFallbackPolling]);

  return wsRef;
};

export default useTelemetrySocket;
