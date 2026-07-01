export interface OldestUnpaidInvoice {
    invoiceId: string;
    subscriberId: string;
    subscriberName: string;
    amount: number;
    createdAt: string;
    ageDays: number;
}

export interface DebtorFinance {
    subscriberId: string;
    subscriberName: string;
    unpaidInvoiceCount: number;
    unpaidInvoiceAmount: number;
    cabinetBalance: number;
    netDebt: number;
    debtSharePercent: number;
}

export interface FinanceSummary {
    generatedAt: string;
    totalCabinetBalance: number;
    unpaidInvoiceCount: number;
    unpaidInvoiceAmount: number;
    balanceAppliedToDebt: number;
    netOutstandingDebt: number;
    debtorCount: number;
    averageDebt: number;
    unappliedCredit: number;
    oldestUnpaidInvoice: OldestUnpaidInvoice | null;
    debtors: DebtorFinance[];
}
