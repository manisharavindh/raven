import { useEffect, useRef, useCallback } from 'react';

/**
 * useVideoSocket — Replaces the MJPEG <img> stream with a WebSocket
 * binary frame receiver that renders to a <canvas>.
 *
 * Advantages over MJPEG:
 * - No HTTP multipart boundary parsing overhead
 * - Binary frames (no base64 encoding) = 33% less bandwidth  
 * - Canvas rendering = zero flicker (double-buffered by browser)
 * - Natural backpressure: browser only processes frames it can handle
 * - Automatic reconnection on disconnect
 *
 * Usage:
 *   const canvasRef = useRef(null);
 *   useVideoSocket({ canvasRef, enabled: isRunning });
 *   return <canvas ref={canvasRef} />;
 */
const useVideoSocket = ({ canvasRef, enabled }) => {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const isMounted = useRef(true);
  const imgRef = useRef(new Image());

  // Setup the image onload handler once — it paints to canvas
  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Resize canvas to match the frame dimensions (only when they change)
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }

      ctx.drawImage(img, 0, 0);
    };
  }, [canvasRef]);

  const connect = useCallback(() => {
    if (!isMounted.current || !enabled) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/feed`;

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[VideoFeed] WebSocket connected');
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };

      ws.onmessage = (event) => {
        // If data is a string, it's JSON status. Otherwise it's our binary frame.
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'status' && !msg.running) {
              const canvas = canvasRef.current;
              if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
              }
            }
          } catch {
            // ignore
          }
        } else {
          // Binary frame (ArrayBuffer or Blob)
          let blob;
          if (event.data instanceof Blob) {
            blob = event.data;
          } else {
            blob = new Blob([event.data], { type: 'image/jpeg' });
          }
          const url = URL.createObjectURL(blob);

          if (imgRef.current._lastUrl) {
            URL.revokeObjectURL(imgRef.current._lastUrl);
          }
          imgRef.current._lastUrl = url;
          imgRef.current.src = url;
        }
      };

      ws.onclose = () => {
        console.log('[VideoFeed] WebSocket closed');
        wsRef.current = null;
        if (isMounted.current && enabled) {
          reconnectTimer.current = setTimeout(connect, 1000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      if (isMounted.current && enabled) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    }
  }, [enabled, canvasRef]);

  useEffect(() => {
    isMounted.current = true;

    if (enabled) {
      connect();
    } else {
      // Not enabled — close any existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }

    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // Clean up last blob URL
      if (imgRef.current._lastUrl) {
        URL.revokeObjectURL(imgRef.current._lastUrl);
      }
    };
  }, [enabled, connect]);

  return wsRef;
};

export default useVideoSocket;
