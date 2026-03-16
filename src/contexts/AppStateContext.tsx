import React, { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react';
import { AppState, AppAction, appReducer, createInitialAppState } from '../types';

const STORAGE_KEYS = {
  INTRO_PLAYED: 'introPlayed',
} as const;

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
  const getInitialState = (): AppState => {
    const baseState = createInitialAppState();

    if (typeof window !== 'undefined') {
      const hasPlayedIntro = sessionStorage.getItem(STORAGE_KEYS.INTRO_PLAYED) === 'true';
      if (hasPlayedIntro) {
        return {
          ...baseState,
          isProjectsUnlocked: true,
          introCompleted: true,
        };
      }
    }

    return baseState;
  };

  const [state, dispatch] = useReducer(appReducer, undefined, getInitialState);

  useEffect(() => {
    if (state.introCompleted && typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEYS.INTRO_PLAYED, 'true');
    }
  }, [state.introCompleted]);

  const unlockProjects = useCallback(() => {
    dispatch({ type: 'UNLOCK_PROJECTS' });
  }, []);

  const setIntroCompleted = useCallback(() => {
    dispatch({ type: 'SET_INTRO_COMPLETED' });
  }, []);

  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEYS.INTRO_PLAYED);
    }
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
