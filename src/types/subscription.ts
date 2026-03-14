export interface SubscriptionServiceResponse {
    id: string;
    name: string;
    price: number;
    createdAt: string;
    updatedAt: string;
}

export interface SubscriptionServiceCreateRequest {
    name: string;
    price: number;
}

export interface SubscriptionServiceUpdateRequest {
    name: string;
    price: number;
}
