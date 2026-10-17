import type {LedgerEntry, LedgerEntryFilter} from '../../../types/ledger';
import type {SubscriberResponse} from '../../../types/subscriber';

/** Adds amounts in whole cents so 2-decimal money never drifts. */
export const sumAmounts = (values: Array<number | string>) =>
    values.reduce<number>((cents, value) => cents + Math.round(Number(value) * 100), 0) / 100;

export interface ChargeGroup {
    chargeId: string;
    serviceName: string;
    month: string;
    description: string | null;
    participantCount: number;
    /** Members carried different weights, so the parts are not equal by design. */
    weighted: boolean;
    total: number;
    minAmount: number;
    maxAmount: number;
    entries: LedgerEntry[];
}

/** One row per charge: the split of one bill across that month's members. */
export function groupByCharge(entries: LedgerEntry[]): ChargeGroup[] {
    const groups = new Map<string, LedgerEntry[]>();
    for (const entry of entries) {
        const list = groups.get(entry.chargeId) ?? [];
        list.push(entry);
        groups.set(entry.chargeId, list);
    }
    return Array.from(groups.entries())
        .map(([chargeId, list]) => {
            const amounts = list.map((entry) => Number(entry.amount));
            const first = list[0];
            return {
                chargeId,
                serviceName: first.subscriptionServiceName,
                month: first.recordedMonth,
                description: first.chargeDescription,
                participantCount: first.participantCount,
                weighted: first.totalWeight !== first.participantCount,
                total: sumAmounts(amounts),
                minAmount: Math.min(...amounts),
                maxAmount: Math.max(...amounts),
                entries: [...list].sort((a, b) => a.subscriberName.localeCompare(b.subscriberName))
            };
        })
        .sort((a, b) => b.month.localeCompare(a.month) || a.serviceName.localeCompare(b.serviceName));
}

/** Who ran it: the subscriber name behind the admin's email when there is one. */
export const actorName = (email: string | null, accountId: string, subscribers: SubscriberResponse[]) => {
    if (!email) return accountId.slice(0, 8);
    return subscribers.find((subscriber) => subscriber.email.toLowerCase() === email.toLowerCase())?.name ?? email;
};

export type InvoiceState = 'all' | 'invoiced' | 'open';

export interface LedgerFilters {
    serviceId: string;
    subscriberId: string;
    recordedMonth: string;
    invoiceState: InvoiceState;
    fromMonth: string;
    toMonth: string;
    generatedByAccountId: string;
    invoiceId: string;
    id: string;
    chargeId: string;
    /** Search every run instead of only the selected one. */
    allRuns: boolean;
}

export const emptyFilters = (): LedgerFilters => ({
    serviceId: '',
    subscriberId: '',
    recordedMonth: '',
    invoiceState: 'all',
    fromMonth: '',
    toMonth: '',
    generatedByAccountId: '',
    invoiceId: '',
    id: '',
    chargeId: '',
    allRuns: false
});

export const ADVANCED_KEYS = ['fromMonth', 'toMonth', 'generatedByAccountId', 'invoiceId', 'id', 'chargeId'] as const;

export const countAdvanced = (filters: LedgerFilters) =>
    ADVANCED_KEYS.filter((key) => filters[key].trim()).length + (filters.allRuns ? 1 : 0);

export const hasFilters = (filters: LedgerFilters) =>
    Boolean(filters.serviceId || filters.subscriberId || filters.recordedMonth || filters.invoiceState !== 'all')
    || ADVANCED_KEYS.some((key) => filters[key].trim());

export function buildFilterRequest(filters: LedgerFilters, runId: string | null): LedgerEntryFilter {
    const request: LedgerEntryFilter = {};
    if (filters.serviceId) request.serviceId = filters.serviceId;
    if (filters.subscriberId) request.subscriberId = filters.subscriberId;
    if (filters.recordedMonth) request.recordedMonth = filters.recordedMonth;
    if (filters.fromMonth) request.fromMonth = filters.fromMonth;
    if (filters.toMonth) request.toMonth = filters.toMonth;
    if (filters.generatedByAccountId.trim()) request.generatedByAccountId = filters.generatedByAccountId.trim();
    if (filters.invoiceId.trim()) request.invoiceId = filters.invoiceId.trim();
    if (filters.id.trim()) request.id = filters.id.trim();
    if (filters.chargeId.trim()) request.chargeId = filters.chargeId.trim();
    if (runId && !filters.allRuns) request.calculationBatchId = runId;
    return request;
}

/** The API has no invoiced/not-invoiced filter, so that one is applied here. */
export const applyInvoiceState = (entries: LedgerEntry[], state: InvoiceState) =>
    state === 'all' ? entries : entries.filter((entry) => (state === 'invoiced') === Boolean(entry.invoiceId));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value.trim());
