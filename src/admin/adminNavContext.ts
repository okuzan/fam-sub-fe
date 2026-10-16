import {createContext, useContext} from 'react';
import type {BankSyncStatus} from '../types/bankPayment';

export interface NavCounts {
    /** Worklist items; set by the Overview once it has computed them. */
    overview?: number;
    bankReview?: number;
    unpaidInvoices?: number;
    subscribers?: number;
    activeMemberships?: number;
    services?: number;
}

export interface AdminNav {
    counts: NavCounts;
    bankSync: BankSyncStatus | null;
    /** Re-read the sidebar counts after anything that changes them. */
    refreshCounts: () => void;
    setOverviewCount: (count: number) => void;
    userEmail?: string | null;
    userName?: string | null;
    canAccessCabinet: boolean;
    onLogout: () => void;
}

export const AdminNavContext = createContext<AdminNav | undefined>(undefined);

export function useAdminNav(): AdminNav {
    const nav = useContext(AdminNavContext);
    if (!nav) throw new Error('useAdminNav must be used inside AdminLayout');
    return nav;
}
