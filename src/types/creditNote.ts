/**
 * An invoice the other way round: a subscriber paid something on the group's
 * behalf. It credits their balance like a bank transfer and settles what it
 * can; undoing it reopens those invoices and takes the credit back.
 */
export interface CreditNoteResponse {
    id: string;
    subscriberId: string;
    subscriberName: string;
    amount: number;
    /** LocalDate "2026-11-14": the day they paid. */
    occurredOn: string;
    reason: string;
    createdAt: string;
    createdByAccountId: string;
    settledInvoiceCount: number;
    settledAmount: number;
    emailSentAt: string | null;
    undoneAt: string | null;
    undoneByAccountId: string | null;
}

export interface CreditNoteCreateRequest {
    subscriberId: string;
    amount: number;
    /** LocalDate; today in Kyiv when left out. */
    occurredOn?: string;
    reason: string;
    sendEmail: boolean;
}

export interface CreditNoteCreateResult {
    creditNote: CreditNoteResponse;
    settledInvoiceIds: string[];
    balanceAfter: number;
}

export interface CreditNoteUndoResult {
    creditNote: CreditNoteResponse;
    reopenedInvoiceIds: string[];
    balanceAfter: number;
}
