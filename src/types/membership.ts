export interface MembershipResponse {
    id: string;
    subscriberId: string;
    subscriberName: string;
    subscriptionServiceId: string;
    subscriptionServiceName: string;
    startMonth: string;
    endMonth?: string | null;
    /** Active in the current month, as the server sees it. */
    activeNow: boolean;
    createdAt: string;
}

export interface MembershipCreateRequest {
    subscriberId: string;
    subscriptionServiceId: string;
    startMonth: string;
    endMonth?: string;
}

/** Only the range can change; subscriber and service are fixed once created. */
export interface MembershipUpdateRequest {
    startMonth: string;
    endMonth?: string | null;
}

export interface MembershipEndRequest {
    endMonth: string;
}
