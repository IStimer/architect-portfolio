import React, { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import { AppState, AppAction, appReducer, createInitialAppState } from '../types';

interface AppStateContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  unlockProjects: () => void;
  setIntroCompleted: () => void;
  resetState: () => void;
}

const AppStateContext = createContext<AppStateContextType | null>(null);

export const useAppState = (): AppStateContextType => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
};

export const useIsProjectsUnlocked = (): boolean => {
  const { state } = useAppState();
  return state.isProjectsUnlocked;
};

interface AppStateProviderProps {
  children: ReactNode;
}

export const AppStateProvider: React.FC<AppStateProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState);

  const unlockProjects = useCallback(() => {
    dispatch({ type: 'UNLOCK_PROJECTS' });
  }, []);

  const setIntroCompleted = useCallback(() => {
    dispatch({ type: 'SET_INTRO_COMPLETED' });
  }, []);

  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  const value: AppStateContextType = {
    state,
    dispatch,
    unlockProjects,
    setIntroCompleted,
    resetState,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};
