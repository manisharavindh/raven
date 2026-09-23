import React, { useState, useEffect, useRef, useMemo } from 'react';

const DefectTable = ({ events, selectedId, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState('event_id');
  const [sortAsc, setSortAsc] = useState(true);
  const tableRef = useRef(null);
  const searchRef = useRef(null);

  // Expose searchRef for keyboard shortcut focusing
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const sortArrow = (col) => {
    if (sortCol !== col) return '';
    return sortAsc ? ' ▲' : ' ▼';
  };

  const filteredAndSorted = useMemo(() => {
    let result = [...events];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.event_id.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA, valB;
      switch (sortCol) {
        case 'event_id': valA = a.event_id; valB = b.event_id; break;
        case 'type': valA = a.type; valB = b.type; break;
        case 'confidence': valA = a.confidence; valB = b.confidence; break;
        case 'latitude': valA = a.latitude; valB = b.latitude; break;
        case 'longitude': valA = a.longitude; valB = b.longitude; break;
        default: valA = a.event_id; valB = b.event_id;
      }

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB);
        return sortAsc ? cmp : -cmp;
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return result;
  }, [events, searchQuery, sortCol, sortAsc]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = filteredAndSorted.findIndex(ev => ev.event_id === selectedId);

        let nextIndex;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex < filteredAndSorted.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : filteredAndSorted.length - 1;
        }

        if (filteredAndSorted[nextIndex]) {
          onSelect(filteredAndSorted[nextIndex].event_id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredAndSorted, selectedId, onSelect]);

  // Scroll selected row into view
  useEffect(() => {
    if (selectedId && tableRef.current) {
      const row = tableRef.current.querySelector(`tr[data-id="${selectedId}"]`);
      if (row) {
        row.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedId]);

  const isCritical = (type) => type.toLowerCase() === 'pothole';

  return (
    <div className="mac-window" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="panel-header">
        <span>Defect List</span>
      </div>

      {/* Toolbar with search */}
      <div className="toolbar">
        <input
          ref={searchRef}
          type="search"
          placeholder="Search defects... (F)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, maxWidth: 250 }}
        />
        <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto', fontSize: 11 }}>
          {filteredAndSorted.length} of {events.length} defects
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }} ref={tableRef}>
        <table className="defect-table">
          <thead>
            <tr>
              <th style={{ width: '24%' }} onClick={() => handleSort('event_id')}>
                ID<span className="sort-arrow">{sortArrow('event_id')}</span>
              </th>
              <th style={{ width: '22%' }} onClick={() => handleSort('type')}>
                Type<span className="sort-arrow">{sortArrow('type')}</span>
              </th>
              <th style={{ width: '22%' }} onClick={() => handleSort('confidence')}>
                Conf<span className="sort-arrow">{sortArrow('confidence')}</span>
              </th>
              <th style={{ width: '16%' }} onClick={() => handleSort('latitude')}>
                Lat<span className="sort-arrow">{sortArrow('latitude')}</span>
              </th>
              <th style={{ width: '16%' }} onClick={() => handleSort('longitude')}>
                Lng<span className="sort-arrow">{sortArrow('longitude')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                  {events.length === 0 ? 'No defects detected.' : 'No results match your search.'}
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((event) => (
                <tr
                  key={event.event_id}
                  data-id={event.event_id}
                  className={selectedId === event.event_id ? 'selected' : ''}
                  onClick={() => onSelect(event.event_id)}
                >
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{event.event_id}</td>
                  <td>
                    <span className={`badge ${isCritical(event.type) ? 'badge-critical' : 'badge-warning'}`}>
                      {event.type.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className="conf-bar">
                      <div
                        className="conf-bar-fill"
                        style={{
                          width: `${event.confidence * 100}%`,
                          backgroundColor: isCritical(event.type) ? 'var(--accent-red)' : 'var(--accent-amber)',
                        }}
                      />
                    </span>
                    {(event.confidence * 100).toFixed(0)}%
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{event.latitude.toFixed(4)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{event.longitude.toFixed(4)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DefectTable;
