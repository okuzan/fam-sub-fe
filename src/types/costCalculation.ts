export interface CostCalculationRequest {
    fromMonth: string; // YYYY-MM format
    toMonth: string;   // YYYY-MM format
}

export interface CostCalculationResult {
    id: string;
    fromMonth: string;
    toMonth: string;
    totalCost: number;
    currency: string;
    calculatedAt: string;
    performedBy: string;
    chargeCount: number;
}

export interface CostCalculationSuggestion {
    suggestedFromMonth: string; // YYYY-MM format
    suggestedToMonth: string;   // YYYY-MM format
    reason: string;
}
