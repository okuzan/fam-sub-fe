export interface ChargeResponse {
    id: string;
    subscriptionServiceId: string;
    subscriptionServiceName: string;
    amount: number;
    chargeDate: string; // Format: "YYYY-MM" for YearMonth
    createdAt: string;
    updatedAt: string;
}

export interface ChargeCreateRequest {
    subscriptionServiceId: string;
    amount: number;
    chargeDate: string; // Format: "YYYY-MM" for YearMonth
}

export interface ChargeUpdateRequest {
    amount: number;
}
