import { RefObject } from 'react';

interface MinimapProps {
  minimapWrapperRef: RefObject<HTMLDivElement>;
  viewportRef: RefObject<HTMLDivElement>;
  minimapContentRef: RefObject<HTMLDivElement>;
  onMinimapClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const Minimap = ({
  minimapWrapperRef,
  viewportRef,
  minimapContentRef,
  onMinimapClick,
  onMouseDown
}: MinimapProps) => {
  return (
    <aside className="minimap-container">
      <div className="minimap-wrapper" ref={minimapWrapperRef}>
        <div
          className="viewport-indicator"
          ref={viewportRef}
        />
        <div
          className="minimap-clickable"
          onClick={onMinimapClick}
          onMouseDown={onMouseDown}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMinimapClick(e as unknown as React.MouseEvent<HTMLDivElement>); } }}
          role="button"
          tabIndex={0}
          aria-label="Navigate to section"
        />
        <div className="minimap-content" ref={minimapContentRef} aria-hidden="true" />
      </div>
    </aside>
  );
};
