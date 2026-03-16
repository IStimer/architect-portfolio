/**
 * Types for application state and context
 */

export interface AppState {
  isProjectsUnlocked: boolean;
  introCompleted: boolean;
}

export type AppAction =
  | { type: 'UNLOCK_PROJECTS' }
  | { type: 'SET_INTRO_COMPLETED' }
  | { type: 'RESET_STATE' };

export const createInitialAppState = (): AppState => ({
  isProjectsUnlocked: false,
  introCompleted: false,
});

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'UNLOCK_PROJECTS':
      return { ...state, isProjectsUnlocked: true };
    case 'SET_INTRO_COMPLETED':
      return { ...state, introCompleted: true, isProjectsUnlocked: true };
    case 'RESET_STATE':
      return createInitialAppState();
    default:
      return state;
  }
}
