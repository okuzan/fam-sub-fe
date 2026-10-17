export interface SubscriptionServiceResponse {
    id: string;
    name: string;
    /** In `currency`, as the merchant states it. */
    price: number;
    /** ISO 4217 letter code, e.g. "USD". */
    currency: string;
    /** Seats in a family plan, or null for a shared account. Members still split the whole bill. */
    seats: number | null;
    /** The price is charged on its own at the start of every month. */
    fixedMonthlyCharge: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SubscriptionServiceCreateRequest {
    name: string;
    price: number;
    currency: string;
    seats: number | null;
    fixedMonthlyCharge: boolean;
}

export interface SubscriptionServiceUpdateRequest {
    name: string;
    price: number;
    currency: string;
    seats: number | null;
    fixedMonthlyCharge: boolean;
}
