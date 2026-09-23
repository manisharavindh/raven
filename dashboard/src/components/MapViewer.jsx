import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';

// Component to dynamically fit map bounds to all markers
const BoundsFitter = ({ events }) => {
  const map = useMap();
  
  useEffect(() => {
    if (events.length > 0) {
      const bounds = L.latLngBounds(events.map(e => [e.latitude, e.longitude]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [events, map]);
  
  return null;
};

// Component to handle flying to selected events
const MapController = ({ selectedId, events }) => {
  const map = useMap();
  
  useEffect(() => {
    if (selectedId) {
      const targetEvent = events.find(e => e.event_id === selectedId);
      if (targetEvent) {
        map.flyTo([targetEvent.latitude, targetEvent.longitude], 18, {
          duration: 1.5,
        });
      }
    }
  }, [selectedId, events, map]);

  return null;
};

// Marker icon based on type
const createMarkerIcon = (type, isSelected) => {
  const isCritical = type.toLowerCase() === 'pothole';
  let color = isCritical ? '#cc0000' : '#cc7700';
  let size = 12;

  if (isSelected) {
    color = '#0000cc';
    size = 16;
  }

  return L.divIcon({
    className: 'custom-icon',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${color};
      border: 2px solid #000;
      border-radius: 50%;
      box-shadow: 0 0 3px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const MapViewer = ({ events, selectedId, onSelect }) => {
  const defaultCenter = [11.0168, 76.9558];
  const markerRefs = React.useRef({});

  useEffect(() => {
    if (selectedId && markerRefs.current[selectedId]) {
      markerRefs.current[selectedId].openPopup();
    }
  }, [selectedId]);

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      style={{ height: '100%', width: '100%', backgroundColor: '#e5e3df' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="bottomright" />

      <BoundsFitter events={events} />
      <MapController selectedId={selectedId} events={events} />

      {events.map(event => {
        const isCritical = event.type.toLowerCase() === 'pothole';
        return (
          <Marker
            key={event.event_id}
            position={[event.latitude, event.longitude]}
            icon={createMarkerIcon(event.type, selectedId === event.event_id)}
            ref={(ref) => { if (ref) markerRefs.current[event.event_id] = ref; }}
            eventHandlers={{ click: () => onSelect(event.event_id) }}
          >
            <Popup className="glass-popup">
              <div style={{ minWidth: 150 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', marginBottom: 4 }}>
                  {event.event_id}
                </div>
                <div style={{ marginBottom: 4 }}>
                  <span className={`badge ${isCritical ? 'badge-critical' : 'badge-warning'}`}>
                    {event.type.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>
                  Confidence: {(event.confidence * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: 10, color: '#555' }}>
                  {event.latitude.toFixed(6)}, {event.longitude.toFixed(6)}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default MapViewer;
