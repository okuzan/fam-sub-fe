import {useEffect, useRef} from 'react';

type EscapeHandler = () => void;

const escapeHandlers: EscapeHandler[] = [];

const handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
        return;
    }

    const handler = escapeHandlers.at(-1);
    if (!handler) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    handler();
};

const registerEscapeHandler = (handler: EscapeHandler) => {
    if (escapeHandlers.length === 0) {
        document.addEventListener('keydown', handleEscapeKey, true);
    }

    escapeHandlers.push(handler);

    return () => {
        const index = escapeHandlers.lastIndexOf(handler);
        if (index !== -1) {
            escapeHandlers.splice(index, 1);
        }

        if (escapeHandlers.length === 0) {
            document.removeEventListener('keydown', handleEscapeKey, true);
        }
    };
};

export const useEscapeClose = (isActive: boolean, onClose: EscapeHandler) => {
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isActive) {
            return;
        }

        return registerEscapeHandler(() => onCloseRef.current());
    }, [isActive]);
};
