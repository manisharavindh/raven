import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
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

// Component to handle flying to selected events and opening popups AFTER flight
const MapController = ({ selectedId, events, markerRefs }) => {
  const map = useMap();
  
  useEffect(() => {
    if (selectedId) {
      const targetEvent = events.find(e => e.event_id === selectedId);
      if (targetEvent) {
        // Fly to the location
        map.flyTo([targetEvent.latitude, targetEvent.longitude], 20, {
          duration: 1.5,
        });

        // Open popup only after movement finishes to stop shaking
        map.once('moveend', () => {
          if (markerRefs.current[selectedId]) {
            markerRefs.current[selectedId].openPopup();
          }
        });
      }
    } else {
      map.closePopup();
    }
  }, [selectedId, events, map, markerRefs]);

  return null;
};

// Marker icon based on type
const createMarkerIcon = (type, isSelected) => {
  const isCritical = type.toLowerCase() === 'pothole';
  let color = isCritical ? '#cc0000' : '#cc7700';
  let size = 12;

  if (isSelected) {
    color = '#00bb00';
    size = 18;
  }

  return L.divIcon({
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
};

const MapViewer = ({ events, selectedId, onSelect }) => {
  const defaultCenter = [11.0168, 76.9558];
  const markerRefs = useRef({});

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

      <BoundsFitter events={events} />
      <MapController selectedId={selectedId} events={events} markerRefs={markerRefs} />

      <MarkerClusterGroup 
        chunkedLoading 
        maxClusterRadius={40}
        spiderfyOnMaxZoom={true}
        disableClusteringAtZoom={18}
      >
        {events.map(event => {
          const isCritical = event.type.toLowerCase() === 'pothole';
          return (
            <Marker
              key={event.event_id}
              position={[event.latitude, event.longitude]}
              icon={createMarkerIcon(event.type, selectedId === event.event_id)}
              zIndexOffset={selectedId === event.event_id ? 1000 : 0}
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
      </MarkerClusterGroup>
    </MapContainer>
  );
};

export default MapViewer;
