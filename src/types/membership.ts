export interface MembershipResponse {
    id: string;
    subscriberId: string;
    subscriptionServiceId: string;
    startMonth: string;
    endMonth?: string;
    createdAt: string;
    updatedAt: string;
}

export interface MembershipCreateRequest {
    subscriberId: string;
    subscriptionServiceId: string;
    startMonth: string;
    endMonth?: string;
}

export interface MembershipUpdateRequest {
    subscriberId?: string;
    subscriptionServiceId?: string;
    startMonth?: string;
    endMonth?: string;
}

export interface MembershipEndRequest {
    endMonth: string;
}
