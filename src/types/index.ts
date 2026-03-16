/**
 * Centralized type exports
 */

export type {
  ProjectCategory,
  ProjectData,
  RectangleData,
  ViewMode,
} from './project';

export type {
  AppState,
  AppAction,
} from './app';

export { createInitialAppState, appReducer } from './app';
