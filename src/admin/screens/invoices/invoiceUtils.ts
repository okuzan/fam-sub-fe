import {API_CONFIG, apiFetch, getInvoicePdfUrl} from '../../../config/api';
import {daysSince, formatDate, formatMonthLong, formatPeriod, plural} from '../../../ui/format';
import type {Tone} from '../../../ui/components';
import type {
    InvoiceResponse,
    InvoiceStatus,
    InvoiceStatusHistoryResponse,
    InvoiceSuggestion
} from '../../../types/invoice';
import {getResponseErrorMessage} from '../../../utils/errors';

export const STATUS_TONE: Record<InvoiceStatus, Tone> = {
    DRAFT: 'clay',
    SENT: 'slate',
    PAID: 'green',
    VOID: 'grey',
};

export const statusTone = (status: string): Tone => STATUS_TONE[status as InvoiceStatus] ?? 'grey';

/** "Apr 2026", "Jul – Aug 2026", or "Manual" for a one-off invoice. */
export const invoicePeriodLabel = (invoice: Pick<InvoiceResponse, 'origin' | 'fromMonth' | 'toMonth'>) =>
    invoice.origin === 'MANUAL' ? 'Manual' : formatPeriod(invoice.fromMonth, invoice.toMonth);

/** How the drawer and dialogs name an invoice: "Ярослав · Apr 2026". */
export const invoiceName = (invoice: InvoiceResponse) =>
    `${invoice.subscriberName} · ${invoice.origin === 'MANUAL'
        ? `manual ${formatDate(invoice.invoiceDate)}`
        : formatPeriod(invoice.fromMonth, invoice.toMonth)}`;

export const isOpen = (invoice: Pick<InvoiceResponse, 'status'>) =>
    invoice.status === 'DRAFT' || invoice.status === 'SENT';

const firstLine = (text: string | undefined | null, max = 32) => {
    const line = text?.split('\n')[0].trim();
    if (!line) return null;
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

const daysAgo = (instant: string) => {
    const days = daysSince(instant);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
};

/** The quiet line under the invoice date in the table. */
export const invoiceSubLine = (invoice: InvoiceResponse, exempt: boolean) => {
    let state: string;
    switch (invoice.status) {
        case 'DRAFT':
            state = 'not emailed yet';
            break;
        case 'SENT':
            state = `open ${plural(daysSince(invoice.invoiceDate), 'day')}`;
            break;
        case 'PAID':
            if (invoice.paidByBankTransactionId) state = `paid ${daysAgo(invoice.statusChangedAt)} · bank`;
            else if (exempt && !invoice.sentAt && invoice.createdAt === invoice.statusChangedAt) state = 'exempt · created paid';
            else state = `paid ${daysAgo(invoice.statusChangedAt)}`;
            break;
        default:
            state = 'voided';
    }
    const note = invoice.origin === 'MANUAL' ? firstLine(invoice.notes) : null;
    return note ? `${note} · ${state}` : state;
};

const HISTORY_TEXT: Record<string, string> = {
    INVOICE_EMAIL_SENT: 'Emailed',
    INVOICE_PAID_FROM_BALANCE: 'Paid from balance',
    INVOICE_MARKED_PAID: 'Marked paid',
    INVOICE_VOIDED: 'Voided',
};

/** The backend summary repeats the invoice UUID; say what happened instead. */
export const historyText = (item: InvoiceStatusHistoryResponse) => {
    if (item.actionType === 'INVOICE_STATUS_UPDATED') {
        if (item.statusAfter === 'PAID') return 'Marked paid';
        if (item.statusBefore === 'PAID') return `Reopened as ${item.statusAfter.toLowerCase()}`;
        return `Status set to ${item.statusAfter.toLowerCase()}`;
    }
    return HISTORY_TEXT[item.actionType] ?? item.summary;
};

export const creationText = (invoice: InvoiceResponse) =>
    invoice.origin === 'MANUAL'
        ? 'Created manually'
        : `Generated for ${invoice.fromMonth === invoice.toMonth
            ? formatMonthLong(invoice.fromMonth)
            : formatPeriod(invoice.fromMonth, invoice.toMonth)}`;

/** The PDF needs the session cookie, so fetch it and save the blob. */
export const downloadInvoicePdf = async (invoice: InvoiceResponse): Promise<string | null> => {
    try {
        const response = await apiFetch(getInvoicePdfUrl(invoice.id));
        if (!response.ok) return await getResponseErrorMessage(response, 'The PDF could not be created.');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-${invoice.subscriberName}-${invoice.fromMonth}-${invoice.id.slice(0, 8)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        return null;
    } catch {
        return 'The PDF could not be downloaded.';
    }
};

/** POST/PATCH JSON to an invoice endpoint; returns the parsed body or an error message. */
export const sendJson = async <T, >(
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: unknown,
    fallback: string
): Promise<{ data: T } | { error: string }> => {
    try {
        const response = await apiFetch(url, {
            method,
            headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) return {error: await getResponseErrorMessage(response, fallback)};
        const text = await response.text();
        return {data: (text ? JSON.parse(text) : null) as T};
    } catch {
        return {error: fallback};
    }
};

export const getJson = async <T, >(url: string, fallback: string): Promise<{ data: T } | { error: string }> => {
    try {
        const response = await apiFetch(url);
        if (!response.ok) return {error: await getResponseErrorMessage(response, fallback)};
        return {data: await response.json() as T};
    } catch {
        return {error: fallback};
    }
};

export const invoiceUrl = (id: string, suffix = '') => `${API_CONFIG.INVOICES_URL}/${id}${suffix}`;

/** "2026-10-16" for a date input, in local time. */
export const todayIso = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const addMonths = (yearMonth: string, months: number) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + months, 1));
    return date.toISOString().slice(0, 7);
};

/** Invoices have UUIDs, not numbers; the drawer shows the first 8 characters. */
export const shortId = (id: string) => id.slice(0, 8);

/** The period to prefill: what the backend suggests, else the month after the last invoiced one. */
export const suggestedPeriod = (suggestion: InvoiceSuggestion | null) => {
    if (suggestion?.suggestedFromMonth && suggestion.suggestedToMonth) {
        return {fromMonth: suggestion.suggestedFromMonth, toMonth: suggestion.suggestedToMonth};
    }
    if (suggestion?.lastInvoicedToMonth) {
        const next = addMonths(suggestion.lastInvoicedToMonth, 1);
        return {fromMonth: next, toMonth: next};
    }
    return null;
};
