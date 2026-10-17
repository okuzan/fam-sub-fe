export type BankDebitStatus = 'UNMATCHED' | 'CHARGED' | 'IGNORED';
export type BankChargeMatchMethod = 'RULE' | 'ADMIN';

/** A card payment to a subscription merchant, read from the Monobank statement. */
export interface BankDebitResponse {
    id: string;
    occurredAt: string;
    /** What left the card, in UAH. */
    amount: number;
    /** What the merchant charged, in `currency`. */
    originalAmount: number;
    /** ISO 4217 letter code, e.g. "USD". */
    currency: string;
    description: string | null;
    /** The rule merchant it was recognised by, lowercased. */
    merchant: string;
    status: BankDebitStatus;
    subscriptionServiceId: string | null;
    subscriptionServiceName: string | null;
    chargeId: string | null;
    chargeMonth: string | null;
    /** The month it belongs to by its date; the default when charging it. */
    suggestedChargeMonth: string;
    /** A service with a rule for the same merchant; only for UNMATCHED. */
    suggestedServiceId: string | null;
    matchMethod: BankChargeMatchMethod | null;
    reviewNote: string | null;
    resolvedAt: string | null;
}

export interface BankMerchantRuleResponse {
    id: string;
    merchant: string;
    currency: string;
    amount: number;
    subscriptionServiceId: string | null;
    subscriptionServiceName: string | null;
    ignored: boolean;
    learnedAutomatically: boolean;
    createdAt: string;
}

export interface BankChargesOverview {
    debits: BankDebitResponse[];
    rules: BankMerchantRuleResponse[];
}

export interface BankDebitChargeRequest {
    subscriptionServiceId: string;
    chargeMonth?: string;
    rememberAmount: boolean;
}

export interface BankMerchantRuleCreateRequest {
    merchant: string;
    currency: string;
    amount: number;
    /** Null makes it an ignore rule. */
    subscriptionServiceId: string | null;
}

export interface BankDebitUndoResult {
    debit: BankDebitResponse;
    chargeId: string;
    chargeDeleted: boolean;
    chargeAmountAfter: number | null;
}
