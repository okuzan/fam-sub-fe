export interface ChargeResponse {
    id: string;
    subscriptionServiceId: string;
    subscriptionServiceName: string;
    amount: number;
    chargeMonth: string; // Format: "YYYY-MM" for YearMonth
    description: string | null;
    createdAt: string;
}

export interface ChargePageResponse {
    content: ChargeResponse[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
}

export interface ChargeCreateRequest {
    subscriptionServiceId: string;
    amount: number;
    chargeMonth: string; // Format: "YYYY-MM" for YearMonth
    description?: string;
}

export interface ChargeUpdateRequest {
    amount: number;
    description?: string;
}
