export type BankTransactionStatus = 'UNMATCHED' | 'APPLIED' | 'IGNORED';

export type BankMatchMethod = 'PAYMENT_CODE' | 'NAME' | 'SENDER_RULE' | 'ADMIN';

export interface BankSyncStatus {
    configured: boolean;
    syncEnabled: boolean;
    syncedTo: string | null;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
}

export interface BankPaymentSuggestion {
    subscriberId: string;
    subscriberName: string;
    reason: string;
}

export interface BankTransactionResponse {
    id: string;
    occurredAt: string;
    amount: number;
    senderName: string | null;
    description: string | null;
    comment: string | null;
    counterIban: string | null;
    status: BankTransactionStatus;
    subscriberId: string | null;
    subscriberName: string | null;
    matchMethod: BankMatchMethod | null;
    reviewNote: string | null;
    settledInvoiceCount: number;
    settledAmount: number | null;
    resolvedAt: string | null;
    suggestions: BankPaymentSuggestion[];
}

export interface BankPaymentsOverview {
    sync: BankSyncStatus;
    transactions: BankTransactionResponse[];
}

export interface BankPaymentResolution {
    transaction: BankTransactionResponse;
    settledInvoiceIds: string[];
    balanceAfter: number | null;
    senderRemembered: boolean;
}

export interface BankPaymentUndoResult {
    transaction: BankTransactionResponse;
    subscriberId: string;
    subscriberName: string;
    reopenedInvoiceIds: string[];
    balanceAfter: number;
}

export interface BankSenderResponse {
    id: string;
    senderName: string | null;
    subscriberId: string | null;
    subscriberName: string | null;
    ignored: boolean;
    learnedAutomatically: boolean;
    createdAt: string;
}

export interface BankSyncResult {
    fetchedCount: number;
    importedCount: number;
    appliedCount: number;
    needsReviewCount: number;
    ignoredCount: number;
    /** Card payments added to a subscription's charge. */
    chargedCount: number;
    /** Card payments to a known merchant waiting on the card charges page. */
    chargeReviewCount: number;
    syncedTo: string;
}

export interface PayPageInvoice {
    fromMonth: string;
    toMonth: string;
    invoiceDate: string;
    amount: number;
    openDays: number;
}

/** A bank transfer as the subscriber sees it in their cabinet (GET /subscriber/payments). */
export interface SubscriberPaymentResponse {
    id: string;
    occurredAt: string;
    amount: number;
    senderName: string | null;
    /** "2026-06" or "2026-04..2026-05"; what it did not settle went to their balance. */
    settledPeriods: string[];
}

export interface PayPageResponse {
    subscriberName: string;
    amountDue: number;
    credit: number;
    unpaidInvoiceCount: number;
    /** Newest first. */
    unpaidInvoices: PayPageInvoice[];
    recipientName: string;
    iban: string;
    cardNumber: string;
    purpose: string;
    nbuQrUrl: string | null;
}
