"use client";

import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../utils/prefersReducedMotion';

interface LenisOptions {
    duration?: number;
    easing?: (t: number) => number;
    direction?: 'vertical' | 'horizontal';
    gestureOrientation?: 'vertical' | 'horizontal' | 'both';
    smoothWheel?: boolean;
    wheelMultiplier?: number;
    smooth?: boolean;
    smoothTouch?: boolean;
    touchMultiplier?: number;
    prevent?: (node: Element) => boolean;
    [key: string]: any;
}

interface ScrollToOptions {
    offset?: number;
    duration?: number;
    easing?: (t: number) => number;
    lerp?: number;
    onComplete?: () => void;
    force?: boolean;
    programmatic?: boolean;
}

type ScrollTarget = string | number | HTMLElement;

const MOBILE_USER_AGENT_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

const DEFAULT_OPTIONS: Readonly<LenisOptions> = {
    duration: 1.2,
    easing: (t: number): number => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    direction: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1,
    smooth: true,
    smoothTouch: false,
    touchMultiplier: 2,
} as const;

const detectMobileDevice = (): boolean => {
    if (typeof window === 'undefined') return false;

    try {
        const isMobileUserAgent = MOBILE_USER_AGENT_REGEX.test(navigator.userAgent);
        const isMobileViewport = window.innerWidth < 768;

        const hasTouchScreen = (
            'ontouchstart' in window ||
            (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0) ||
            (navigator as any).msMaxTouchPoints > 0
        );

        return (isMobileUserAgent || isMobileViewport) && hasTouchScreen;
    } catch {
        return false;
    }
};

if (typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
}

class LenisService {
    private instance: Lenis | null = null;
    private rafCallback: ((time: number) => void) | null = null;

    private isMobileDevice(): boolean {
        return detectMobileDevice();
    }

    private preventLenis = (node: Element): boolean => {
        try {
            return !!node.closest('[data-lenis-prevent]');
        } catch {
            return false;
        }
    };

    public init(options: LenisOptions = {}): Lenis | null {
        if (typeof window === 'undefined') return null;
        if (this.instance) return this.instance;

        try {
            const isMobile = this.isMobileDevice();

            if (isMobile || prefersReducedMotion()) {
                return null;
            }

            const mergedOptions: LenisOptions = {
                ...DEFAULT_OPTIONS,
                ...options,
                prevent: this.preventLenis
            };

            this.instance = new Lenis(mergedOptions);

            this.instance.on('scroll', ScrollTrigger.update);

            this.rafCallback = (time: number): void => {
                if (this.instance) {
                    this.instance.raf(time * 1000);
                }
            };

            gsap.ticker.add(this.rafCallback);
            gsap.ticker.lagSmoothing(0);

            return this.instance;

        } catch (error) {
            if (import.meta.env.DEV) console.error('Error initializing Lenis:', error);
            return null;
        }
    }

    public destroy(): void {
        try {
            if (this.rafCallback) {
                gsap.ticker.remove(this.rafCallback);
                this.rafCallback = null;
            }

            if (this.instance) {
                this.instance.destroy();
                this.instance = null;
            }
        } catch (error) {
            if (import.meta.env.DEV) console.error('Error destroying Lenis:', error);
        }
    }

    public scrollTo(target: ScrollTarget, options?: ScrollToOptions): void {
        try {
            if (!this.instance) {
                this.nativeScrollTo(target);
                return;
            }

            this.instance.scrollTo(target, options);
        } catch (error) {
            if (import.meta.env.DEV) console.error('Error scrollTo:', error);
            this.nativeScrollTo(target);
        }
    }

    private nativeScrollTo(target: ScrollTarget): void {
        try {
            if (typeof target === 'string') {
                const element = document.querySelector(target);
                if (element && element instanceof HTMLElement) {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            } else if (typeof target === 'number') {
                window.scrollTo({ top: target, behavior: 'smooth' });
            } else if (target instanceof HTMLElement) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (error) {
            if (import.meta.env.DEV) console.error('Error native scroll:', error);
        }
    }

    public stop(): void {
        try {
            if (this.instance) {
                this.instance.stop();
            }
        } catch (error) {
            if (import.meta.env.DEV) console.error('Error stopping Lenis:', error);
        }
    }

    public start(): void {
        try {
            if (this.instance) {
                this.instance.start();
            }
        } catch (error) {
            if (import.meta.env.DEV) console.error('Error starting Lenis:', error);
        }
    }

    public getInstance(): Lenis | null {
        return this.instance;
    }

    public isActive(): boolean {
        return this.instance !== null;
    }

    public resize(): void {
        try {
            if (this.instance) {
                this.instance.resize();
            }
        } catch (error) {
            if (import.meta.env.DEV) console.error('Error resizing Lenis:', error);
        }
    }
}

export const lenisService = new LenisService();
