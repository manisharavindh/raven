import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import L from 'leaflet';

const BoundsFitter = ({ events, selectedId }) => {
  const map = useMap();
  const prevLength = useRef(0);
  
  useEffect(() => {
    if (selectedId) return; // Do not auto-fit if a specific event is selected

    if (events.length > 0 && events.length !== prevLength.current) {
      const bounds = L.latLngBounds(events.map(e => [e.latitude, e.longitude]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], animate: true });
        prevLength.current = events.length;
      }
    } else if (events.length === 0) {
      prevLength.current = 0;
    }
  }, [events, map, selectedId]);
  
  return null;
};

// Component to handle flying to selected events
const MapController = ({ selectedId, events }) => {
  const map = useMap();
  const prevSelectedId = useRef(null);
  
  useEffect(() => {
    if (selectedId) {
      // Only snap view if the selected ID actually changed
      if (selectedId !== prevSelectedId.current) {
        const targetEvent = events.find(e => e.event_id === selectedId);
        if (targetEvent && targetEvent.latitude != null && targetEvent.longitude != null) {
          map.setView([targetEvent.latitude, targetEvent.longitude], 20, { animate: true });
        }
      }
    }
    
    prevSelectedId.current = selectedId;
  }, [selectedId, events, map]);

  return null;
};

const iconCache = {};

// Marker icon based on type (Cached to prevent re-renders and cluster flickering)
const getMarkerIcon = (type, isSelected) => {
  const isCritical = type.toLowerCase() === 'pothole';
  const key = `${isCritical ? 'critical' : 'warning'}-${isSelected}`;
  
  if (!iconCache[key]) {
    let color = isCritical ? '#cc0000' : '#cc7700';
    let size = 12;

    if (isSelected) {
      color = '#00bb00';
      size = 18;
    }

    iconCache[key] = L.divIcon({
      className: 'custom-icon',
      html: `<div style="
        width: ${size}px; height: ${size}px;
        background: ${color};
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 2px rgba(0,0,0,0.5);
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }
  
  return iconCache[key];
};

const MapViewer = ({ events, selectedId, onSelect }) => {
  const defaultCenter = [11.0168, 76.9558];
  
  const selectedEvent = events.find(e => e.event_id === selectedId);

  // Memoize markers so they don't rebuild every time confidence updates via WebSocket
  const memoizedMarkers = React.useMemo(() => {
    return events.map(event => (
      <Marker
        key={event.event_id}
        position={[event.latitude, event.longitude]}
        icon={getMarkerIcon(event.type, selectedId === event.event_id)}
        zIndexOffset={selectedId === event.event_id ? 1000 : 0}
        eventHandlers={{ click: () => onSelect(event.event_id) }}
      />
    ));
  }, [events.length, selectedId, onSelect]); // Only rebuild if count changes or selection changes

  // Memoize popup position so it doesn't create a new array reference on every WS update
  const popupPosition = React.useMemo(() => {
    if (!selectedEvent) return null;
    return [selectedEvent.latitude, selectedEvent.longitude];
  }, [selectedEvent?.event_id]);

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      maxZoom={22}
      style={{ height: '100%', width: '100%', backgroundColor: '#000000' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        attribution='&copy; Google Maps'
        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        maxZoom={22}
        maxNativeZoom={20}
      />
      <ZoomControl position="bottomright" />

      <BoundsFitter events={events} selectedId={selectedId} />
      <MapController selectedId={selectedId} events={events} />

      <MarkerClusterGroup 
        chunkedLoading 
        maxClusterRadius={40}
        spiderfyOnMaxZoom={true}
        disableClusteringAtZoom={18}
      >
        {memoizedMarkers}
      </MarkerClusterGroup>
      
      {selectedEvent && popupPosition && (
        <Popup 
          key={`popup-${selectedEvent.event_id}`}
          position={popupPosition}
          className="glass-popup"
          eventHandlers={{ 
            remove: (e) => {
              // Ensure this was triggered by Leaflet (user closed it), not React unmounting
              if (e.target && !e.target._map) {
                onSelect(null);
              }
            } 
          }}
        >
          <div style={{ minWidth: 150 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', marginBottom: 4 }}>
              {selectedEvent.event_id}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span className={`badge ${selectedEvent.type.toLowerCase() === 'pothole' ? 'badge-critical' : 'badge-warning'}`}>
                {selectedEvent.type.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>
              Confidence: {(selectedEvent.confidence * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 10, color: '#555' }}>
              {selectedEvent.latitude.toFixed(6)}, {selectedEvent.longitude.toFixed(6)}
            </div>
          </div>
        </Popup>
      )}
    </MapContainer>
  );
};

export default MapViewer;
