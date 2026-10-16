export interface SubscriberResponse {
    id: string;
    name: string;
    /** As the bank writes it; with the name, it recognises their transfers. */
    surname: string | null;
    email: string;
    balance: number;
    billingExempt: boolean;
    createdAt: string;
    updatedAt: string;
    /**
     * Derived by the server: no current or upcoming membership, nothing unpaid
     * or uninvoiced, and a balance of exactly 0. Adding a membership undoes it.
     */
    archived: boolean;
    /** Distinct service names of every membership they ever had, sorted. */
    formerServices: string[];
    /** "YYYY-MM"; null when a membership is open-ended or they never had one. */
    lastMembershipEndMonth: string | null;
    /** When their latest paid invoice was marked paid. */
    lastInvoicePaidAt: string | null;
}

export interface SubscriberCreateRequest {
    name: string;
    surname: string | null;
    email: string;
    balance?: number;
    billingExempt: boolean;
}

export interface SubscriberUpdateRequest {
    name: string;
    surname: string | null;
    email: string;
    balance: number;
    billingExempt: boolean;
}

export interface ActiveSubscriptionDto {
    id: string;
    serviceName: string;
    servicePrice: number;
    startMonth: string;
    endMonth?: string;
}

export interface UnpaidInvoiceDto {
    id: string;
    totalAmount: number;
    fromMonth: string;
    toMonth: string;
    invoiceDate: string;
    createdAt: string;
    status: string;
    notes?: string;
    origin: string;
}

export interface SubscriberDetailResponse {
    id: string;
    name: string;
    email: string;
    /** The secret in their pay page link; see getPayPageUrl. */
    payToken: string;
    balance: number;
    totalAmountOwed: number;
    activeSubscriptions: ActiveSubscriptionDto[];
    unpaidInvoices: UnpaidInvoiceDto[];
}

export interface SubscriberDebtPaymentItemResult {
    invoiceId: string;
    statusBefore: string;
    statusAfter: string;
    invoiceAmount: number;
    paid: boolean;
    message: string;
}

export interface SubscriberDebtPaymentResult {
    subscriberId: string;
    subscriberName: string;
    attemptedCount: number;
    paidCount: number;
    totalPaidAmount: number;
    includeCredit: boolean;
    balanceBefore: number;
    balance: number;
    balanceAfter: number;
    creditWrittenOff: number;
    items: SubscriberDebtPaymentItemResult[];
}
