import type {InvoiceLedgerEntryResponse} from './invoice';
import type {ActiveSubscriptionDto} from './subscriber';

/** GET /subscriber/cabinet: the signed-in subscriber's own standing. */
export interface SubscriberCabinetResponse {
    subscriber: SubscriberCabinetProfile;
    /** The secret in their pay page link, /pay/<payToken>. */
    payToken: string;
    balance: number;
    totalAmountOwed: number;
    activeSubscriptions: ActiveSubscriptionDto[];
    unpaidInvoices: SubscriberInvoiceSummary[];
}

export interface SubscriberCabinetProfile {
    id: string;
    name: string;
    email: string;
}

/** An invoice as the subscriber sees it (GET /subscriber/invoices). */
export interface SubscriberInvoiceSummary {
    id: string;
    fromMonth: string;
    toMonth: string;
    invoiceDate: string;
    totalAmount: number;
    status: string;
    createdAt: string;
    sentAt: string | null;
    notes: string | null;
    origin: string;
}

/** GET /subscriber/invoices/{id}. */
export interface SubscriberInvoiceDetail {
    invoice: SubscriberInvoiceSummary;
    entries: InvoiceLedgerEntryResponse[];
}
