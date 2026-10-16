export interface SubscriberResponse {
    id: string;
    name: string;
    email: string;
    balance: number;
    billingExempt: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SubscriberCreateRequest {
    name: string;
    email: string;
    balance?: number;
    billingExempt: boolean;
}

export interface SubscriberUpdateRequest {
    name: string;
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
