import { useContext } from "react";
import { LenisContext, type LenisContextValue } from "../providers/LenisProvider";

/**
 * Hook pour accéder au service Lenis et son état
 * @returns Objet contenant le service Lenis et son état d'activation
 * @throws Error si utilisé en dehors du LenisProvider
 */
export const useLenis = (): LenisContextValue => {
    const context = useContext(LenisContext);

    if (!context) {
        throw new Error(
            'useLenis must be used within a LenisProvider. ' +
            'Make sure to wrap your component with <LenisProvider>.'
        );
    }

    return context;
};
