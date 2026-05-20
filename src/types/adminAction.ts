export const AdminActionType = {
    COST_CALCULATION_RUN: 'COST_CALCULATION_RUN',
    INVOICE_GENERATION_RUN: 'INVOICE_GENERATION_RUN'
} as const;

export type AdminActionType = typeof AdminActionType[keyof typeof AdminActionType];

export interface AdminActionResponse {
    id: string;
    type: AdminActionType;
    createdAt: string;
    createdByAccountId: string;
    fromMonth: string;
    toMonth: string;
    subscriberId: string | null;
    summary: string;
    metrics: Record<string, unknown>;
}
