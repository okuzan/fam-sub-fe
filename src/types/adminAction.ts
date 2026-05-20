export const AdminActionType = {
    COST_CALCULATION_RUN: 'COST_CALCULATION_RUN',
    COST_CALCULATION_RUN_UNDONE: 'COST_CALCULATION_RUN_UNDONE',
    INVOICE_GENERATION_RUN: 'INVOICE_GENERATION_RUN',
    INVOICE_GENERATION_RUN_UNDONE: 'INVOICE_GENERATION_RUN_UNDONE',
    MANUAL_INVOICE_CREATED: 'MANUAL_INVOICE_CREATED',
    OUTSTANDING_BALANCE_INVOICE_CREATED: 'OUTSTANDING_BALANCE_INVOICE_CREATED',
    INVOICE_MARKED_PAID: 'INVOICE_MARKED_PAID',
    INVOICE_PAID_FROM_BALANCE: 'INVOICE_PAID_FROM_BALANCE',
    INVOICE_EMAIL_SENT: 'INVOICE_EMAIL_SENT',
    INVOICE_VOIDED: 'INVOICE_VOIDED',
    INVOICE_DELETED: 'INVOICE_DELETED',
    INVOICE_NOTES_UPDATED: 'INVOICE_NOTES_UPDATED',
    SUBSCRIBER_CREATED: 'SUBSCRIBER_CREATED',
    SUBSCRIBER_UPDATED: 'SUBSCRIBER_UPDATED',
    SUBSCRIBER_DELETED: 'SUBSCRIBER_DELETED',
    SUBSCRIBER_SITUATION_EMAIL_SENT: 'SUBSCRIBER_SITUATION_EMAIL_SENT',
    CHARGE_CREATED: 'CHARGE_CREATED',
    CHARGE_UPDATED: 'CHARGE_UPDATED',
    CHARGE_DELETED: 'CHARGE_DELETED',
    MEMBERSHIP_CREATED: 'MEMBERSHIP_CREATED',
    MEMBERSHIP_UPDATED: 'MEMBERSHIP_UPDATED',
    MEMBERSHIP_ENDED: 'MEMBERSHIP_ENDED',
    MEMBERSHIP_DELETED: 'MEMBERSHIP_DELETED',
    SUBSCRIPTION_SERVICE_CREATED: 'SUBSCRIPTION_SERVICE_CREATED',
    SUBSCRIPTION_SERVICE_UPDATED: 'SUBSCRIPTION_SERVICE_UPDATED',
    SUBSCRIPTION_SERVICE_DELETED: 'SUBSCRIPTION_SERVICE_DELETED',
    PINNED_POST_GENERATED: 'PINNED_POST_GENERATED'
} as const;

export type AdminActionType = typeof AdminActionType[keyof typeof AdminActionType];

export const AdminActionTargetType = {
    COST_CALCULATION_RUN: 'COST_CALCULATION_RUN',
    INVOICE_GENERATION_RUN: 'INVOICE_GENERATION_RUN',
    INVOICE: 'INVOICE',
    SUBSCRIBER: 'SUBSCRIBER',
    CHARGE: 'CHARGE',
    MEMBERSHIP: 'MEMBERSHIP',
    SUBSCRIPTION_SERVICE: 'SUBSCRIPTION_SERVICE',
    PINNED_POST: 'PINNED_POST'
} as const;

export type AdminActionTargetType =
    typeof AdminActionTargetType[keyof typeof AdminActionTargetType];

export interface AdminActionResponse {
    id: string;
    type: AdminActionType;
    createdAt: string;
    createdByAccountId: string;
    targetType: AdminActionTargetType;
    targetId: string | null;
    fromMonth: string | null;
    toMonth: string | null;
    subscriberId: string | null;
    summary: string;
    metrics: Record<string, unknown | null>;
}

export interface RunRecoveryPreviewResponse {
    runId: string;
    type: string;
    allowed: boolean;
    alreadyUndone: boolean;
    blockers: string[];
    effects: Record<string, unknown>;
    summary: string;
}

export interface RunUndoRequest {
    reason?: string;
}

export interface RunUndoResponse {
    runId: string;
    type: string;
    undoneAt: string;
    summary: string;
    effects: Record<string, unknown>;
}

export interface AdminActionFilterRequest {
    actionType?: AdminActionType;
    targetType?: AdminActionTargetType;
    targetId?: string;
    subscriberId?: string;
    createdByAccountId?: string;
    dateFrom?: string;
    dateTo?: string;
    fromMonth?: string;
    toMonth?: string;
    limit?: number;
}
