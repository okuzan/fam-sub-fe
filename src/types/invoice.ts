export const InvoiceOrigin = {
    SUBSCRIPTION_LEDGER: 'SUBSCRIPTION_LEDGER',
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
    /** Optional: generate for one subscriber only; omitted means everyone. */
    subscriberId?: string;
    /** Email each new invoice right away (drafts become sent). */
    sendEmail?: boolean;
}

export interface ManualInvoiceCreateRequest {
    subscriberId: string;
    amount: number;
    invoiceDate: string; // YYYY-MM-DD
    notes: string;
    sendEmail?: boolean;
}

export interface InvoiceDuplicateRequest {
    subscriberId: string;
    amount: number;
    invoiceDate?: string; // YYYY-MM-DD
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
    invoiceDate: string;
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
    /** Set when a bank transfer settled it; GET /admin/bank-payments/{id} describes the transfer. */
    paidByBankTransactionId?: string | null;
    /** Set when a credit note settled it. */
    paidByCreditNoteId?: string | null;
}

/** PATCH /admin/invoices/{id}/void */
export interface InvoiceVoidResult {
    invoice: InvoiceResponse;
    /** Credited to the subscriber's balance because the voided invoice had been paid. */
    balanceCredited?: number | null;
}

export interface InvoiceLedgerEntryResponse {
    ledgerEntryId: string;
    chargeId: string;
    subscriptionServiceId: string;
    subscriptionServiceName: string;
    recordedMonth: string;
    amount: number;
    participantCount: number;
    /** This subscriber's weight out of totalWeight; 1 of participantCount for an even split. */
    shareWeight: number;
    totalWeight: number;
    calculatedAt: string;
    /** Set when the line was written off: the invoice was voided and reissued without it. */
    writtenOffAt?: string | null;
    writtenOffReason?: string | null;
}

/** POST /admin/invoices/{id}/write-off */
export interface InvoiceWriteOffResult {
    /** The original, now VOID, still holding the written-off lines. */
    voidedInvoice: InvoiceResponse;
    /** The same period without those lines; null when every line was written off. */
    reissuedInvoice: InvoiceResponse | null;
    writtenOffAmount: number;
    writtenOffLines: string[];
    /** Credited back because the voided invoice had been paid. */
    balanceCredited?: number | null;
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
    runId: string;
    invoicesCreated: number;
    ledgerEntriesAssigned: number;
    totalAmount: number;
    /** Invoices their balance covered in full, created already paid. */
    paidFromBalanceCount: number;
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
    /** Created already paid from their balance; its email is a receipt. */
    paidFromBalance: boolean;
    message: string;
}

export interface DraftInvoiceBulkEmailItemResult {
    invoiceId: string;
    subscriberId: string;
    subscriberName: string;
    statusBefore: string;
    statusAfter: string;
    sent: boolean;
    updated: boolean;
    message: string;
}

export interface DraftInvoiceBulkEmailResult {
    attemptedCount: number;
    sentCount: number;
    updatedCount: number;
    failedCount: number;
    dryRun: boolean;
    items: DraftInvoiceBulkEmailItemResult[];
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
    invoiceDateFrom?: string; // YYYY-MM-DD
    invoiceDateTo?: string;   // YYYY-MM-DD
    origin?: string;
}

export interface InvoiceNotesUpdateRequest {
    notes?: string; // nullable - can be undefined to clear notes
}
