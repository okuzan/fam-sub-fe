export const InvoiceOrigin = {
    SUBSCRIPTION_LEDGER: 'SUBSCRIPTION_LEDGER',
    OUTSTANDING_BALANCE: 'OUTSTANDING_BALANCE',
    MANUAL: 'MANUAL'
} as const;

export type InvoiceOrigin = typeof InvoiceOrigin[keyof typeof InvoiceOrigin];

export const InvoiceStatus = {
    DRAFT: 'DRAFT',
    SENT: 'SENT',
    PAID: 'PAID',
    VOID: 'VOID'
} as const;

export type InvoiceStatus = typeof InvoiceStatus[keyof typeof InvoiceStatus];

export interface InvoiceGenerationRequest {
    fromMonth: string; // YYYY-MM format
    toMonth: string;   // YYYY-MM format
    subscriberIds?: string[]; // Optional: generate for specific subscribers only
}

export interface ManualInvoiceCreateRequest {
    subscriberId: string;
    amount: number;
    invoiceMonth: string; // YYYY-MM
    notes: string;
    sendEmail?: boolean;
}

export interface InvoiceVoidRequest {
    reason?: string;
}

export interface InvoiceStatusUpdateRequest {
    status: InvoiceStatus;
}

export interface InvoiceResponse {
    id: string;
    subscriberId: string;
    subscriberName: string;
    fromMonth: string;
    toMonth: string;
    totalAmount: number;
    status: InvoiceStatus;
    createdAt: string;
    statusChangedAt: string;
    createdByAccountId: string;
    sentAt?: string;
    emailSent: boolean;
    notes?: string;
    origin: InvoiceOrigin;
    invoiceGenerationRunId?: string | null;
}

export interface InvoiceLedgerEntryResponse {
    ledgerEntryId: string;
    chargeId: string;
    subscriptionServiceId: string;
    subscriptionServiceName: string;
    recordedMonth: string;
    amount: number;
    participantCount: number;
    calculatedAt: string;
}

export interface InvoiceDetailResponse {
    invoice: InvoiceResponse;
    entries: InvoiceLedgerEntryResponse[];
}

export interface InvoiceStatusHistoryResponse {
    actionId: string;
    changedAt: string;
    changedByAccountId: string;
    statusBefore?: string | null;
    statusAfter: string;
    actionType: string;
    summary: string;
}

export interface InvoiceGenerationResult {
    runId?: string;
    invoicesCreated: number;
    ledgerEntriesAssigned: number;
    totalAmount: number;
    items: InvoiceGenerationItemResult[];
}

export interface InvoiceGenerationItemResult {
    invoiceId: string;
    subscriberId: string;
    subscriberName: string;
    fromMonth: string;
    toMonth: string;
    totalAmount: number;
    ledgerEntryCount: number;
    emailRequested: boolean;
    emailSent: boolean;
    message: string;
}

export interface DraftInvoiceBulkEmailItemResult {
    invoiceId: string;
    subscriberId?: string;
    subscriberName?: string;
    success?: boolean;
    emailSent?: boolean;
    statusUpdated?: boolean;
    message?: string;
    error?: string;
}

export interface DraftInvoiceBulkEmailResult {
    attemptedCount: number;
    sentCount: number;
    updatedCount: number;
    failedCount: number;
    dryRun: boolean;
    items: DraftInvoiceBulkEmailItemResult[];
    failedInvoiceIds?: string[];
}

export interface InvoiceBulkBalancePaymentItemResult {
    invoiceId: string;
    subscriberId: string;
    subscriberName: string;
    statusBefore: string;
    statusAfter: string;
    invoiceAmount: number;
    balanceBefore: number;
    balanceAfter: number;
    paid: boolean;
    skipped: boolean;
    updated: boolean;
    message: string;
}

export interface InvoiceBulkBalancePaymentResult {
    attemptedCount: number;
    paidCount: number;
    skippedCount: number;
    failedCount: number;
    totalPaidAmount: number;
    items: InvoiceBulkBalancePaymentItemResult[];
}

export interface InvoiceSuggestion {
    lastInvoicedToMonth?: string;
    suggestedFromMonth?: string;
    suggestedToMonth?: string;
}

export interface InvoiceFilterRequest {
    subscriberId?: string;
    status?: string;
    dateFrom?: string; // ISO date string
    dateTo?: string;   // ISO date string
    origin?: string;
}

export interface InvoiceNotesUpdateRequest {
    notes?: string; // nullable - can be undefined to clear notes
}
