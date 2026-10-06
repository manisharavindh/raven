import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

const DefectTable = ({ events, selectedId, onSelect, onRefresh, isMaximized, onMaximize }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState('event_id');
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

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

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortCol, sortAsc, events.length]);

  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSorted.slice(start, start + itemsPerPage);
  }, [filteredAndSorted, currentPage]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await fetch(`/api/events/${id}/delete`, { method: 'POST' });
      if (onRefresh) onRefresh();
      if (selectedId === id) onSelect(null);
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  const handleClear = async (e, id) => {
    e.stopPropagation();
    try {
      await fetch(`/api/events/${id}/clear`, { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to clear', err);
    }
  };

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

      {/* Toolbar with search */}
      <div className="toolbar">
        <input
          ref={searchRef}
          type="search"
          placeholder="Search defects... (F)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <span style={{ color: 'var(--text-secondary)', marginLeft: '12px', fontSize: 11, whiteSpace: 'nowrap' }}>
          {filteredAndSorted.length} defects
        </span>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }}>
          <button 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(p => p - 1)}
            style={{ padding: '2px 8px', fontSize: 10, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
          >
            ◀ Prev
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(p => p + 1)}
            style={{ padding: '2px 8px', fontSize: 10, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
          >
            Next ▶
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }} ref={tableRef}>
        <table className="defect-table">
          <thead>
            <tr>
              <th style={{ width: '20%' }} onClick={() => handleSort('event_id')}>
                ID<span className="sort-arrow">{sortArrow('event_id')}</span>
              </th>
              <th style={{ width: '20%' }} onClick={() => handleSort('timestamp')}>
                Time<span className="sort-arrow">{sortArrow('timestamp')}</span>
              </th>
              <th style={{ width: '20%' }} onClick={() => handleSort('type')}>
                Type<span className="sort-arrow">{sortArrow('type')}</span>
              </th>
              <th style={{ width: '20%' }} onClick={() => handleSort('confidence')}>
                Conf<span className="sort-arrow">{sortArrow('confidence')}</span>
              </th>
              <th style={{ width: '20%' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEvents.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                  {events.length === 0 ? 'No defects detected.' : 'No results match your search.'}
                </td>
              </tr>
            ) : (
              paginatedEvents.map((event) => {
                const isCleared = event.status === 'cleared';
                return (
                  <tr
                    key={event.event_id}
                    data-id={event.event_id}
                    className={`${selectedId === event.event_id ? 'selected' : ''} ${isCleared ? 'cleared-row' : ''}`}
                    onClick={() => onSelect(event.event_id)}
                    style={{ opacity: isCleared ? 0.5 : 1 }}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{event.event_id}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      {(() => {
                        const d = new Date();
                        d.setHours(9, 0, 0, 0);
                        d.setSeconds(event.timestamp || 0);
                        return d.toLocaleTimeString('en-US', { hour12: false });
                      })()}
                    </td>
                    <td>
                      <span className={`badge ${isCritical(event.type) ? 'badge-critical' : 'badge-warning'}`}>
                        {event.type.toUpperCase() === 'POTHOLE' ? 'PTHL' : (event.type.toUpperCase() === 'CRACK' ? 'CRK' : event.type.toUpperCase())}
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
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!isCleared && (
                          <button 
                            style={{ padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
                            onClick={(e) => handleClear(e, event.event_id)}
                          >
                            Clear
                          </button>
                        )}
                        <button 
                          style={{ padding: '2px 6px', fontSize: 10, cursor: 'pointer', color: 'red' }}
                          onClick={(e) => handleDelete(e, event.event_id)}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DefectTable;
