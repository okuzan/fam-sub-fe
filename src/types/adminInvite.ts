export type AdminInviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface AdminInviteResponse {
    id: string;
    email: string;
    status: AdminInviteStatus;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    invitedByAccountId: string;
    acceptedByAccountId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AdminInviteCreateRequest {
    email: string;
}

export interface AdminInviteAcceptRequest {
    token: string;
}

export interface AdminInviteAcceptResponse {
    accepted: boolean;
    email: string;
}
