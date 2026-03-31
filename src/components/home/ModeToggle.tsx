import type { ViewMode } from '../../types';

interface ModeToggleProps {
  viewMode: ViewMode;
  onToggle: () => void;
}

const ModeToggle = ({ viewMode, onToggle }: ModeToggleProps) => {
  const isTransitioning = viewMode.startsWith('transitioning');
  const isSlider = viewMode === 'slider' || viewMode === 'transitioning-to-grid';
  const isGrid = viewMode === 'grid' || viewMode === 'transitioning-to-slider';

  return (
    <button
      className="mode-toggle"
      onClick={onToggle}
      disabled={isTransitioning}
      aria-label={`Switch to ${isSlider ? 'grid' : 'slider'} view`}
    >
      <span
        className={`mode-toggle__label${isSlider ? ' mode-toggle__label--active' : ''}`}
      >
        Slider
      </span>
      <span className="mode-toggle__divider">/</span>
      <span
        className={`mode-toggle__label${isGrid ? ' mode-toggle__label--active' : ''}`}
      >
        Grid
      </span>
    </button>
  );
};

export default ModeToggle;
