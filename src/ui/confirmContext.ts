import {createContext, type ReactNode, useContext} from 'react';

export interface ConfirmOptions {
    title: ReactNode;
    text?: ReactNode;
    confirmLabel: string;
    /** danger = red (void, delete), dark = undo, primary = green. */
    tone?: 'danger' | 'dark' | 'primary';
    /** Ask for a reason in the dialog; confirming needs one when reasonRequired. */
    reason?: {
        label: string;
        placeholder?: string;
        required?: boolean;
        requiredMessage?: string;
    };
}

export interface ConfirmResult {
    confirmed: boolean;
    reason: string;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

export const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

/**
 * Replaces window.confirm(): `const {confirmed, reason} = await confirm({...})`.
 */
export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext);
    if (!confirm) throw new Error('useConfirm must be used within a ConfirmProvider');
    return confirm;
}
