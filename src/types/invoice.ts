export const InvoiceOrigin = {
    SUBSCRIPTION_LEDGER: 'SUBSCRIPTION_LEDGER',
    OUTSTANDING_BALANCE: 'OUTSTANDING_BALANCE'
} as const;

export type InvoiceOrigin = typeof InvoiceOrigin[keyof typeof InvoiceOrigin];

export interface InvoiceGenerationRequest {
    fromMonth: string; // YYYY-MM format
    toMonth: string;   // YYYY-MM format
    subscriberIds?: string[]; // Optional: generate for specific subscribers only
}

export interface OutstandingBalanceInvoiceRequest {
    subscriberId: string;
}

export interface InvoiceResponse {
    id: string;
    subscriberId: string;
    subscriberName: string;
    fromMonth: string;
    toMonth: string;
    totalAmount: number;
    status: string;
    createdAt: string;
    createdByAccountId: string;
    sentAt?: string;
    emailSent: boolean;
    notes?: string;
    origin: InvoiceOrigin;
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

export interface InvoiceGenerationResult {
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

export interface InvoiceSuggestion {
    lastInvoicedToMonth?: string;
    suggestedFromMonth?: string;
    suggestedToMonth?: string;
}
