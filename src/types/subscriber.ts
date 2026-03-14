export interface SubscriberResponse {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    updatedAt: string;
}

export interface SubscriberCreateRequest {
    name: string;
    email: string;
}

export interface SubscriberUpdateRequest {
    name: string;
    email: string;
}
