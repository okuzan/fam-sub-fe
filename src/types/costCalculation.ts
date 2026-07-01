export interface CostCalculationRequest {
    fromMonth: string; // YYYY-MM format
    toMonth: string;   // YYYY-MM format
}

export interface CostCalculationResult {
    batchId: string | null;
    fromMonth: string;
    toMonth: string;
    createdAt: string;
    createdByAccountId: string;
    monthsProcessed: number;
    chargesProcessed: number;
    chargesSkipped: number;
    ledgerEntriesCreated: number;
    items: CostCalculationItemResult[];
}

export interface CostCalculationItemResult {
    chargeId: string;
    serviceId: string;
    serviceName: string;
    chargeAmount: number;
    participantCount: number;
    success: boolean;
    message: string;
}

export interface CostCalculationSuggestion {
    lastCalculatedToMonth: string | null;
    suggestedFromMonth: string; // YYYY-MM format
    suggestedToMonth: string;   // YYYY-MM format
}

export interface CostCalculationBatchResponse {
    id: string;
    fromMonth: string; // YYYY-MM format
    toMonth: string;   // YYYY-MM format
    createdAt: string; // ISO timestamp
    createdByAccountId: string;
}
