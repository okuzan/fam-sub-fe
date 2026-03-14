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
