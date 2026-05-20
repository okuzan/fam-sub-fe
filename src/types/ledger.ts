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
    amount: string;
    participantCount: number;
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
