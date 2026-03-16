import React, { useState } from 'react';
import '../styles/components/_grid.scss';

const FigmaGrid: React.FC = () => {
  const [showGrid, setShowGrid] = useState(true);

  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        setShowGrid(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (!showGrid) return null;

  return (
    <div className="grid-overlay" aria-hidden="true" role="presentation">
      <div className="grid-overlay__rows">
        <div className="grid grid--rows-overlay grid--overlay">
          <div className="grid__item"></div>
          <div className="grid__item"></div>
          <div className="grid__item"></div>
          <div className="grid__item"></div>
        </div>
      </div>

      <div className="grid-overlay__columns">
        <div className="grid grid--columns-overlay grid--overlay">
          <div className="grid__item"></div>
          <div className="grid__item"></div>
          <div className="grid__item"></div>
        </div>
      </div>
    </div>
  );
};

export default FigmaGrid;
