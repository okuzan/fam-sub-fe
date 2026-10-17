export interface MembershipResponse {
    id: string;
    subscriberId: string;
    subscriberName: string;
    subscriptionServiceId: string;
    subscriptionServiceName: string;
    startMonth: string;
    endMonth?: string | null;
    /** Share relative to the other members that month; 1 for everyone is an even split. */
    shareWeight: number;
    /** Active in the current month, as the server sees it. */
    activeNow: boolean;
    createdAt: string;
}

export interface MembershipCreateRequest {
    subscriberId: string;
    subscriptionServiceId: string;
    startMonth: string;
    endMonth?: string;
    shareWeight?: number;
}

/** Only the range and the share can change; subscriber and service are fixed once created. */
export interface MembershipUpdateRequest {
    startMonth: string;
    endMonth?: string | null;
    shareWeight?: number;
}

export interface MembershipEndRequest {
    endMonth: string;
}
