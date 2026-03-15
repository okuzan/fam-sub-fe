export interface MembershipResponse {
    id: string;
    subscriberId: string;
    serviceId: string;
    startDate: string;
    endDate?: string;
    createdAt: string;
    updatedAt: string;
}

export interface MembershipCreateRequest {
    subscriberId: string;
    serviceId: string;
    startDate: string;
    endDate?: string;
}

export interface MembershipUpdateRequest {
    subscriberId?: string;
    serviceId?: string;
    startDate?: string;
    endDate?: string;
}

export interface MembershipEndRequest {
    endDate: string;
}
