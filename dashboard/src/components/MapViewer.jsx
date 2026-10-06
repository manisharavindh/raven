import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, GeoJSON, Polyline } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import L from 'leaflet';

const damageColors = {
  healthy: '#2ecc71',
  low: '#a9df9f',
  moderate: '#f1c40f',
  high: '#e67e22',
  severe: '#e74c3c'
};

const MapController = ({ selectedId, events, selectedRoad, mapData, mapMode }) => {
  const map = useMap();
  
  useEffect(() => {
    if (mapMode === 'roads' && selectedRoad && mapData) {
      const roadFeatures = mapData.features.filter(f => f.properties.road_id === selectedRoad);
      if (roadFeatures.length > 0) {
        const bounds = L.geoJSON(roadFeatures).getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [50, 50], duration: 0.8 });
        }
      }
    } else if (selectedId) {
      const targetEvent = events.find(e => e.event_id === selectedId);
      if (targetEvent && targetEvent.latitude != null && targetEvent.longitude != null) {
        map.flyTo([targetEvent.latitude, targetEvent.longitude], 19, { duration: 0.5 });
      }
    }
  }, [selectedRoad, selectedId, events, mapData, map, mapMode]);

  return null;
};

const iconCache = {};

const getMarkerIcon = (type, isSelected) => {
  const isCritical = type.toLowerCase() === 'pothole';
  const key = `${isCritical ? 'critical' : 'warning'}-${isSelected}`;
  
  if (!iconCache[key]) {
    let color = isCritical ? '#e74c3c' : '#f39c12';
    let size = 12;

    if (isSelected) {
      color = '#2ecc71';
      size = 18;
    }

    iconCache[key] = L.divIcon({
      className: 'custom-icon',
      html: `<div style="
        width: ${size}px; height: ${size}px;
        background: ${color};
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 4px rgba(0,0,0,0.5);
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }
  
  return iconCache[key];
};

const MapViewer = ({ events, selectedId, onSelect, datasetMode, mapMode, damageViewEnabled, showRanking, debugAlignment }) => {
  const defaultCenter = [11.0168, 76.9558];
  
  const [mapData, setMapData] = useState(null);
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [showSelectedRoadPoints, setShowSelectedRoadPoints] = useState(false);
  
  const geojsonRef = useRef(null);

  useEffect(() => {
    const url = datasetMode === 'demo' ? '/demo/coimbatore/road_damage.geojson' : '/api/map/roads';
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.type === 'FeatureCollection') {
          setMapData(data);
        }
      })
      .catch(err => console.error("Failed to load map geometries", err));
  }, [events, datasetMode]);

  const selectedEvent = events.find(e => e.event_id === selectedId);

  // Markers logic based on mode
  const displayEvents = useMemo(() => {
    if (mapMode === 'points') return events; // show all
    if (mapMode === 'roads') {
      if (selectedRoad && showSelectedRoadPoints && mapData) {
        const roadFeature = mapData.features.find(f => f.properties.road_id === selectedRoad);
        if (roadFeature && roadFeature.properties.event_ids) {
          const eventIds = new Set(roadFeature.properties.event_ids);
          return events.filter(e => eventIds.has(e.event_id));
        }
        return [];
      }
      if (debugAlignment) return events; // show all in debug
      return []; // hide by default
    }
    return [];
  }, [events, mapMode, selectedRoad, showSelectedRoadPoints, debugAlignment, mapData]);

  const memoizedMarkers = useMemo(() => {
    return displayEvents.map(event => (
      <Marker
        key={event.event_id}
        position={[event.latitude, event.longitude]}
        icon={getMarkerIcon(event.type, selectedId === event.event_id)}
        zIndexOffset={selectedId === event.event_id ? 1000 : 0}
        eventHandlers={{ 
          click: (e) => {
            L.DomEvent.stopPropagation(e.originalEvent);
            onSelect(event.event_id);
          }
        }}
      />
    ));
  }, [displayEvents, selectedId, onSelect]);

  const popupPosition = useMemo(() => {
    if (!selectedEvent) return null;
    return [selectedEvent.latitude, selectedEvent.longitude];
  }, [selectedEvent?.event_id]);

  // GeoJSON style for Road Damage mode
  const styleFeature = (feature) => {
    const isSelected = feature.properties.road_id === selectedRoad;
    const level = feature.properties.damage_level;
    
    let color = damageColors[level] || '#aaa';
    let weight = isSelected ? 8 : 4;
    let opacity = isSelected ? 1.0 : 0.8;
    
    if (damageViewEnabled && !isSelected) {
      if (level === 'healthy' || level === 'low') {
        color = '#555';
        opacity = 0.3;
        weight = 2;
      } else {
        weight = 6;
      }
    }

    return {
      color,
      weight,
      opacity,
      lineCap: 'round',
      lineJoin: 'round',
      className: isSelected ? 'road-selected' : 'road-segment'
    };
  };

  const onEachFeature = (feature, layer) => {
    layer.on({
      mouseover: (e) => {
        if (mapMode !== 'roads') return;
        const layer = e.target;
        if (feature.properties.road_id !== selectedRoad) {
          layer.setStyle({ weight: 6, opacity: 1 });
        }
        layer.bindTooltip(`
          <strong>${feature.properties.road_name}</strong><br/>
          Damage: ${feature.properties.damage_level.toUpperCase()}<br/>
          Detections: ${feature.properties.detection_count}
        `, { sticky: true, className: 'glass-tooltip' }).openTooltip();
      },
      mouseout: (e) => {
        if (mapMode !== 'roads') return;
        const layer = e.target;
        layer.closeTooltip();
        if (geojsonRef.current) {
          geojsonRef.current.resetStyle(layer);
        }
      },
      click: (e) => {
        if (mapMode !== 'roads') return;
        L.DomEvent.stopPropagation(e.originalEvent);
        setSelectedRoad(feature.properties.road_id);
        setShowSelectedRoadPoints(true);
        onSelect(null);
      }
    });
  };

  const clearSelection = () => {
    setSelectedRoad(null);
    onSelect(null);
  };

  const ranking = useMemo(() => {
    if (!mapData) return [];
    return [...mapData.features]
      .map(f => f.properties)
      .sort((a, b) => b.damage_score - a.damage_score)
      .slice(0, 10);
  }, [mapData]);

  const selectedRoadData = useMemo(() => {
    if (!selectedRoad || !mapData) return null;
    return mapData.features.find(f => f.properties.road_id === selectedRoad)?.properties;
  }, [selectedRoad, mapData]);

  // Render
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <MapContainer
        center={defaultCenter}
        zoom={13}
        maxZoom={22}
        style={{ flex: 1, width: '100%', backgroundColor: '#0f0f0f' }}
        zoomControl={false}
        attributionControl={false}
        onClick={clearSelection}
      >
        <TileLayer
          attribution='&copy; Google Maps'
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          maxZoom={22}
          maxNativeZoom={20}
        />
        <ZoomControl position="bottomright" />
        
        <MapController selectedId={selectedId} events={events} selectedRoad={selectedRoad} mapData={mapData} mapMode={mapMode} />

        {/* Road GeoJSON Layer (Only in Road Damage Mode) */}
        {mapMode === 'roads' && mapData && (
          <GeoJSON 
            key={`roads-${damageViewEnabled}-${selectedRoad}-${mapData.features.length}`} 
            ref={geojsonRef}
            data={mapData} 
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        )}



        {/* Markers */}
        {mapMode === 'points' ? (
          <MarkerClusterGroup chunkedLoading maxClusterRadius={40} spiderfyOnMaxZoom={true} disableClusteringAtZoom={18}>
            {memoizedMarkers}
          </MarkerClusterGroup>
        ) : (
          /* In Road mode, no clustering so it's clean for the specific road */
          <>{memoizedMarkers}</>
        )}
        
        {/* Detection Details Popup */}
        {selectedEvent && popupPosition && (
          <Popup 
            key={`popup-${selectedEvent.event_id}`}
            position={popupPosition}
            className="glass-popup"
            eventHandlers={{ remove: () => onSelect(null) }}
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


      {/* Selected Road Details Panel */}
      {mapMode === 'roads' && selectedRoadData && (
        <div className="mac-window" style={{
          position: 'absolute',
          top: 50,
          right: 20,
          zIndex: 1000,
          width: 250,
        }}>
          <div className="panel-header">
            <span>{selectedRoadData.road_name}</span>
            <button 
              onClick={() => setSelectedRoad(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, position: 'absolute', right: 4 }}
            >
              ✕
            </button>
          </div>
          <div style={{ padding: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
              <span>Damage Level</span>
              <span style={{ fontWeight: 'bold', color: damageColors[selectedRoadData.damage_level] }}>
                {selectedRoadData.damage_level.toUpperCase()}
              </span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
              <span>Damage Score</span>
              <span>{selectedRoadData.damage_score.toFixed(2)}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15, fontSize: 12 }}>
              <span>Total Detections</span>
              <span>{selectedRoadData.detection_count}</span>
            </div>

            <button 
              className="mac-btn"
              onClick={() => setShowSelectedRoadPoints(!showSelectedRoadPoints)}
              style={{ width: '100%', marginBottom: 10, justifyContent: 'center' }}
            >
              {showSelectedRoadPoints ? 'Hide Detections' : 'View Detections'}
            </button>
          </div>
        </div>
      )}

      {/* Ranking Sidebar */}
      {mapMode === 'roads' && showRanking && !selectedRoadData && (
        <div className="mac-window" style={{
          position: 'absolute',
          top: 50,
          right: 20,
          zIndex: 1000,
          width: 300,
          maxHeight: 'calc(100% - 100px)',
        }}>
          <div className="panel-header"><span>Most Damaged Roads</span></div>
          <div style={{ padding: 10, overflowY: 'auto', flex: 1 }}>
          {ranking.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No road damage detected yet.</div>
          ) : (
            ranking.map((road, idx) => (
              <div 
                key={road.road_id}
                onClick={() => {
                  setSelectedRoad(road.road_id);
                  setShowSelectedRoadPoints(true);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--mac-shadow)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, width: 15 }}>{idx + 1}</div>
                  <div style={{ fontSize: 12 }}>{road.road_name}</div>
                </div>
                <div style={{ 
                  fontSize: 10, 
                  fontWeight: 'bold', 
                  padding: '2px 4px',
                  border: '1px solid var(--mac-shadow)',
                  backgroundColor: damageColors[road.damage_level],
                  color: road.damage_level === 'moderate' || road.damage_level === 'low' ? 'black' : 'white'
                }}>
                  {road.damage_level.toUpperCase()}
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      )}
      
      {/* Empty State Overlay */}
      {events.length === 0 && (
        <div className="mac-window" style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 900,
          padding: 20,
          textAlign: 'center',
        }}>
          <h3 style={{ margin: '0 0 10px 0' }}>No Detections</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12 }}>Start a RAVEN analysis to populate the map.</p>
        </div>
      )}
    </div>
  );
};

export default MapViewer;
