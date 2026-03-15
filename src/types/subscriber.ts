export interface SubscriberResponse {
    id: string;
    name: string;
    email: string;
    balance: number;
    createdAt: string;
    updatedAt: string;
}

export interface SubscriberCreateRequest {
    name: string;
    email: string;
    balance?: number;
}

export interface SubscriberUpdateRequest {
    name: string;
    email: string;
    balance: number;
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
    createdAt: string;
    status: string;
    notes?: string;
}

export interface SubscriberDetailResponse {
    id: string;
    name: string;
    email: string;
    balance: number;
    totalAmountOwed: number;
    activeSubscriptions: ActiveSubscriptionDto[];
    unpaidInvoices: UnpaidInvoiceDto[];
}
