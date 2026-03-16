import { createContext, useLayoutEffect, useState, ReactNode } from 'react';
import { lenisService } from '../services/lenisService';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Types
interface LenisOptions {
    duration?: number;
    easing?: (t: number) => number;
    direction?: 'vertical' | 'horizontal';
    gestureDirection?: 'vertical' | 'horizontal' | 'both';
    smooth?: boolean;
    mouseMultiplier?: number;
    smoothTouch?: boolean;
    touchMultiplier?: number;
    infinite?: boolean;
    autoResize?: boolean;
    [key: string]: any;
}

interface LenisContextValue {
    service: typeof lenisService;
    isActive: boolean;
}

interface LenisProviderProps {
    options?: LenisOptions;
    children: ReactNode;
}

export const LenisContext = createContext<LenisContextValue | null>(null);

const DEFAULT_LENIS_OPTIONS: LenisOptions = {};

const LenisProvider: React.FC<LenisProviderProps> = ({
    options = DEFAULT_LENIS_OPTIONS,
    children
}) => {
    const [isLenisActive, setIsLenisActive] = useState<boolean>(false);

    useLayoutEffect(() => {
        const instance = lenisService.init(options);
        setIsLenisActive(!!instance);

        if (instance) {
            ScrollTrigger.refresh();
        }

        return (): void => {
            lenisService.destroy();
        };
    }, []);

    const contextValue: LenisContextValue = {
        service: lenisService,
        isActive: isLenisActive
    };

    return (
        <LenisContext.Provider value={contextValue}>
            {children}
        </LenisContext.Provider>
    );
};

export default LenisProvider;

export type { LenisContextValue };
