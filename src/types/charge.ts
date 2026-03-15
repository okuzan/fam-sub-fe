export interface ChargeResponse {
    id: string;
    subscriptionServiceId: string;
    subscriptionServiceName: string;
    amount: number;
    chargeMonth: string; // Format: "YYYY-MM" for YearMonth
    description: string | null;
    createdAt: string;
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
