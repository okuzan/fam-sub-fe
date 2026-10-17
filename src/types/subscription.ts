export interface SubscriptionServiceResponse {
    id: string;
    name: string;
    price: number;
    /** The price is charged on its own at the start of every month. */
    fixedMonthlyCharge: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SubscriptionServiceCreateRequest {
    name: string;
    price: number;
    fixedMonthlyCharge: boolean;
}

export interface SubscriptionServiceUpdateRequest {
    name: string;
    price: number;
    fixedMonthlyCharge: boolean;
}
