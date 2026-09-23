import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Create a custom pulsing dot icon for the markers
const createCustomIcon = (isSelected) => {
  return L.divIcon({
    className: 'custom-icon',
    html: `
      <div style="
        width: 16px; 
        height: 16px; 
        background-color: ${isSelected ? 'var(--accent-cyan)' : 'var(--accent-amber)'};
        border-radius: 50%;
        border: 2px solid var(--bg-color);
        box-shadow: 0 0 ${isSelected ? '15px var(--accent-cyan)' : '5px var(--accent-amber)'};
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

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

const MapViewer = ({ events, selectedId, onSelect }) => {
  const defaultCenter = [11.0168, 76.9558];
  
  // Keep refs to markers to open their popups programmatically
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
      
      <BoundsFitter events={events} />
      <MapController selectedId={selectedId} events={events} />

      {events.map(event => {
        // Determine severity color
        const isCritical = event.type.toLowerCase() === 'pothole';
        const colorVar = isCritical ? 'var(--accent-red)' : 'var(--accent-amber)';
        
        return (
          <Marker 
            key={event.event_id}
            position={[event.latitude, event.longitude]}
            icon={L.divIcon({
              className: 'custom-icon',
              html: `
                <div style="
                  width: 16px; 
                  height: 16px; 
                  background-color: ${selectedId === event.event_id ? 'var(--accent-cyan)' : colorVar};
                  border-radius: 50%;
                  border: 2px solid var(--bg-color);
                  box-shadow: 0 0 ${selectedId === event.event_id ? '15px var(--accent-cyan)' : `5px ${colorVar}`};
                "></div>
              `,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })}
            ref={(ref) => {
              if (ref) markerRefs.current[event.event_id] = ref;
            }}
            eventHandlers={{
              click: () => onSelect(event.event_id),
            }}
          >
          <Popup className="glass-popup">
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
              {event.event_id}
            </div>
            <div>{event.type.toUpperCase()}</div>
          </Popup>
        </Marker>
        );
      })}
    </MapContainer>
  );
};

export default MapViewer;
