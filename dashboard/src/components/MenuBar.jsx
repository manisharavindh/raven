import React, { useState, useEffect, useRef } from 'react';

const MenuBar = ({ onAction, isLiveRunning, filterType }) => {
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
    ],
    View: [
      { label: 'All Defects', action: 'filter-all', shortcut: '1', checked: filterType === 'ALL' },
      { label: 'Potholes Only', action: 'filter-potholes', shortcut: '2', checked: filterType === 'CRITICAL' },
      { label: 'Cracks Only', action: 'filter-cracks', shortcut: '3', checked: filterType === 'WARNING' },
    ],
    Tools: [
      { label: isLiveRunning ? 'Stop Camera' : 'Start Live Camera', action: 'toggle-camera' },
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
                  <div key={i} className="menu-dropdown-item" onMouseDown={(e) => { e.stopPropagation(); handleAction(item.action); }}>
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
      <div style={{ fontWeight: 'bold', paddingRight: 8 }}>RAVEN</div>
    </div>
  );
};

export default MenuBar;
