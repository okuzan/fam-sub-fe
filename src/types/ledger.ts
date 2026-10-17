export interface CalculationBatch {
    id: string;
    fromMonth: string;
    toMonth: string;
    createdAt: string;
    generatedByAccountId: string;
    generatedByAccountName: string | null;
    ledgerEntryCount: number;
    undoneAt?: string | null;
    undoneByAccountId?: string | null;
    undoneByAccountName?: string | null;
    undoReason?: string | null;
}

export interface LedgerEntry {
    id: string;
    chargeId: string;
    chargeMonth: string;
    chargeDescription: string | null;
    subscriptionServiceId: string;
    subscriptionServiceName: string;
    subscriberId: string;
    subscriberName: string;
    recordedMonth: string;
    amount: number;
    participantCount: number;
    /** This subscriber's weight out of totalWeight; 1 of participantCount for an even split. */
    shareWeight: number;
    totalWeight: number;
    calculatedAt: string;
    calculationBatchId: string;
    calculationBatchFromMonth: string;
    calculationBatchToMonth: string;
    generatedByAccountId: string;
    generatedByAccountName: string | null;
    invoiceId: string | null;
    notes: string | null;
}

export interface LedgerEntryFilter {
    id?: string;
    chargeId?: string;
    serviceId?: string;
    subscriberId?: string;
    recordedMonth?: string;
    fromMonth?: string;
    toMonth?: string;
    calculationBatchId?: string;
    generatedByAccountId?: string;
    invoiceId?: string;
}

/** The backend's name for a ledger entry row. */
export type LedgerEntryResponse = LedgerEntry;
