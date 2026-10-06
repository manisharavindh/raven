import React, { useState, useEffect, useRef } from 'react';

const MenuBar = ({ onAction, isLiveRunning, filterType, datasetMode, mapMode, damageViewEnabled, showRanking, debugAlignment }) => {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (menuName) => {
    setOpenMenu(openMenu === menuName ? null : menuName);
  };

  const handleAction = (action) => {
    setOpenMenu(null);
    onAction(action);
  };

  const menus = {
    File: [
      { label: 'Export as CSV', action: 'export-csv', shortcut: '⌘E' },
      { label: 'Export as JSON', action: 'export-json', shortcut: '⌘J' },
      { separator: true },
      { label: 'Refresh Data', action: 'refresh', shortcut: '⌘R' },
      { separator: true },
      { label: 'Delete All Data…', action: 'delete-all-data', danger: true },
    ],
    View: [
      { label: 'All Defects', action: 'filter-all', shortcut: '1', checked: filterType === 'ALL' },
      { label: 'Potholes Only', action: 'filter-potholes', shortcut: '2', checked: filterType === 'CRITICAL' },
      { label: 'Cracks Only', action: 'filter-cracks', shortcut: '3', checked: filterType === 'WARNING' },
    ],
    Tools: [
      { label: 'Run Detection…', action: 'start-detection', disabled: isLiveRunning },
      { label: 'Start Live Camera', action: 'start-live', disabled: isLiveRunning },
      { separator: true },
      { label: 'Stop Pipeline', action: 'stop-pipeline', disabled: !isLiveRunning },
    ],
    Dataset: [
      { label: 'Live / Current Data', action: 'set-dataset-live', checked: datasetMode === 'live' },
      { label: 'Coimbatore Synthetic Demo', action: 'set-dataset-demo', checked: datasetMode === 'demo' },
    ],
    Map: [
      { label: 'Points Mode', action: 'map-mode-points', checked: mapMode === 'points' },
      { label: 'Road Damage Mode', action: 'map-mode-roads', checked: mapMode === 'roads' },
      { separator: true },
      { label: 'Damage View', action: 'map-toggle-damage', checked: damageViewEnabled, disabled: mapMode !== 'roads' },
      { label: 'Most Damaged Roads', action: 'map-toggle-ranking', checked: showRanking, disabled: mapMode !== 'roads' },
      { separator: true },
      { label: 'Dev Mode', action: 'map-toggle-debug', checked: debugAlignment },
    ],
    Help: [
      { label: 'Keyboard Shortcuts', action: 'show-shortcuts' },
      { separator: true },
      { label: 'About RAVEN', action: 'about' },
    ],
  };

  return (
    <div className="menu-bar" ref={menuRef}>
      {Object.entries(menus).map(([name, items]) => (
        <div key={name} className={`menu-item ${openMenu === name ? 'open' : ''}`}
          onMouseDown={() => handleMenuClick(name)}
          onMouseEnter={() => openMenu && setOpenMenu(name)}
        >
          {name}
          {openMenu === name && (
            <div className="menu-dropdown">
              {items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="menu-separator" />
                ) : (
                  <div
                    key={i}
                    className={`menu-dropdown-item ${item.danger ? 'menu-dropdown-item-danger' : ''} ${item.disabled ? 'menu-dropdown-item-disabled' : ''}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (!item.disabled) handleAction(item.action);
                    }}
                  >
                    <span>{item.checked ? '✓ ' : ''}{item.label}</span>
                    {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ flex: 1 }} />
      {datasetMode === 'demo' && (
        <div style={{ 
          marginRight: 15, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          backgroundColor: 'rgba(231, 76, 60, 0.2)',
          border: '1px solid #e74c3c',
          padding: '2px 8px',
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 'bold',
          color: '#e74c3c'
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#e74c3c', animation: 'pulse 2s infinite' }} />
          SYNTHETIC DEMO
        </div>
      )}
      <div style={{ fontWeight: 'bold', paddingRight: 8 }}>RAVEN</div>
    </div>
  );
};

export default MenuBar;
