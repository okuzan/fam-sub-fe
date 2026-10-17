import {useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {Brand, Drawer, DrawerSection, EmptyState, Notice, Tabs, Tag, type Tone} from '../ui/components';
import {
    currentMonth,
    daysSince,
    formatDate,
    formatMoney,
    formatMonth,
    formatMonthLong,
    formatPeriod,
    formatWhen,
    plural,
    shareLabel
} from '../ui/format';
import type {SubscriberCabinetResponse, SubscriberInvoiceDetail, SubscriberInvoiceSummary} from '../types/cabinet';
import type {SubscriberPaymentResponse} from '../types/bankPayment';
import './SubscriberCabinet.css';

interface SubscriberCabinetProps {
    userEmail?: string | null;
    canAccessAdmin?: boolean;
    onLogout?: () => void;
}

type CabinetTab = 'overview' | 'invoices';

const STATUS: Record<string, { label: string; tone: Tone }> = {
    DRAFT: {label: 'Open', tone: 'clay'},
    SENT: {label: 'Open', tone: 'clay'},
    PAID: {label: 'Paid', tone: 'green'},
    VOID: {label: 'Void', tone: 'grey'},
};

const statusOf = (status: string) => STATUS[status] ?? {label: status, tone: 'grey' as Tone};

const isOpen = (invoice: SubscriberInvoiceSummary) => invoice.status === 'DRAFT' || invoice.status === 'SENT';

/** "Aug 2026", or for a manual invoice the day it was issued. */
const invoiceTitle = (invoice: SubscriberInvoiceSummary) =>
    invoice.origin === 'MANUAL'
        ? `Invoice of ${formatDate(invoice.invoiceDate)}`
        : formatPeriod(invoice.fromMonth, invoice.toMonth);

/** "2026-06" or "2026-04..2026-05" → "Jun 2026" / "Apr – May 2026". */
const settledPeriodLabel = (period: string) => {
    const [from, to] = period.split('..');
    return to ? formatPeriod(from, to) : formatMonth(from);
};

const paymentOutcome = (payment: SubscriberPaymentResponse) => {
    const periods = payment.settledPeriods.map(settledPeriodLabel);
    if (periods.length === 0) return 'added to your balance';
    if (periods.length === 1) return `settled the ${periods[0]} invoice`;
    return `settled the ${periods.slice(0, -1).join(', ')} and ${periods[periods.length - 1]} invoices`;
};

export default function SubscriberCabinet({userEmail, canAccessAdmin = false, onLogout}: SubscriberCabinetProps) {
    const [cabinet, setCabinet] = useState<SubscriberCabinetResponse | null>(null);
    const [payments, setPayments] = useState<SubscriberPaymentResponse[] | null>(null);
    const [invoices, setInvoices] = useState<SubscriberInvoiceSummary[] | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<SubscriberInvoiceDetail | null>(null);
    const [activeTab, setActiveTab] = useState<CabinetTab>('overview');
    const [loading, setLoading] = useState(true);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchCabinet = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiFetch(API_CONFIG.SUBSCRIBER_CABINET_URL);
            if (!response.ok) {
                setError(await getResponseErrorMessage(response, 'Could not load your cabinet'));
                return;
            }
            setCabinet(await response.json());
        } catch (err) {
            console.error('Failed to load subscriber cabinet:', err);
            setError('Could not load your cabinet');
        } finally {
            setLoading(false);
        }
    }, []);

    // Payments are a nice-to-have: if they fail the rest of the cabinet still works.
    const fetchPayments = useCallback(async () => {
        try {
            const response = await apiFetch(API_CONFIG.SUBSCRIBER_PAYMENTS_URL);
            setPayments(response.ok ? await response.json() : []);
        } catch (err) {
            console.error('Failed to load subscriber payments:', err);
            setPayments([]);
        }
    }, []);

    const fetchInvoices = useCallback(async () => {
        setLoadingInvoices(true);
        setError(null);
        try {
            const response = await apiFetch(API_CONFIG.SUBSCRIBER_INVOICES_URL);
            if (!response.ok) {
                setError(await getResponseErrorMessage(response, 'Could not load your invoices'));
                return;
            }
            setInvoices(await response.json());
        } catch (err) {
            console.error('Failed to load subscriber invoices:', err);
            setError('Could not load your invoices');
        } finally {
            setLoadingInvoices(false);
        }
    }, []);

    useEffect(() => {
        void fetchCabinet();
        void fetchPayments();
    }, [fetchCabinet, fetchPayments]);

    const handleTabChange = (tab: CabinetTab) => {
        setActiveTab(tab);
        if (tab === 'invoices' && invoices === null && !loadingInvoices) void fetchInvoices();
    };

    const handleViewInvoice = async (invoiceId: string) => {
        setLoadingInvoiceId(invoiceId);
        setError(null);
        try {
            const response = await apiFetch(`${API_CONFIG.SUBSCRIBER_INVOICES_URL}/${invoiceId}`);
            if (!response.ok) {
                setError(await getResponseErrorMessage(response, 'Could not load the invoice'));
                return;
            }
            setSelectedInvoice(await response.json());
        } catch (err) {
            console.error('Failed to load subscriber invoice:', err);
            setError('Could not load the invoice');
        } finally {
            setLoadingInvoiceId(null);
        }
    };

    const openInvoices = useMemo(
        () => [...(cabinet?.unpaidInvoices ?? [])].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate)),
        [cabinet]
    );

    const header = (
        <header className="cab-top">
            <Brand href="/subscriber/cabinet"/>
            <nav className="cab-top-actions" aria-label="Account">
                <span className="cab-top-email">{userEmail ?? cabinet?.subscriber.email}</span>
                {canAccessAdmin && <a className="ui-btn is-small cab-top-btn" href="/admin">Admin</a>}
                <button type="button" className="ui-btn is-small cab-top-btn" onClick={onLogout}>Log out</button>
            </nav>
        </header>
    );

    if (loading) {
        return (
            <main className="cab">
                {header}
                <div className="cab-body" aria-busy="true" aria-label="Loading">
                    <div className="cab-hero">
                        <div className="cab-hero-text">
                            <span className="ui-skeleton-bar" style={{width: 140}}/>
                            <span className="ui-skeleton-bar cab-skeleton-amount"/>
                            <span className="ui-skeleton-bar" style={{width: 220}}/>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    if (!cabinet) {
        return (
            <main className="cab">
                {header}
                <div className="cab-body">
                    <Notice tone="red">{error ?? 'Your cabinet is unavailable right now.'}</Notice>
                    <div>
                        <button type="button" className="ui-btn" onClick={() => void fetchCabinet()}>Try again</button>
                    </div>
                </div>
            </main>
        );
    }

    const owed = Number(cabinet.totalAmountOwed);
    const balance = Number(cabinet.balance);
    const name = cabinet.subscriber.name;
    const openCount = cabinet.unpaidInvoices.length;
    const monthName = formatMonthLong(currentMonth()).split(' ')[0];

    const renderInvoiceRow = (invoice: SubscriberInvoiceSummary, withStatus: boolean) => {
        const status = statusOf(invoice.status);
        const open = isOpen(invoice);
        return (
            <button
                key={invoice.id}
                type="button"
                className="cab-row cab-invoice-row"
                onClick={() => void handleViewInvoice(invoice.id)}
                disabled={loadingInvoiceId === invoice.id}
            >
                <span className="cab-row-text">
                    <span className="cab-row-title">{invoiceTitle(invoice)}</span>
                    <span className="cab-row-meta">
                        Invoice date {formatDate(invoice.invoiceDate)}
                        {open && ` · open ${plural(daysSince(invoice.invoiceDate), 'day')}`}
                        {invoice.notes && ` · ${invoice.notes}`}
                    </span>
                </span>
                {withStatus && <Tag tone={status.tone}>{status.label}</Tag>}
                <span className="cab-row-link">{loadingInvoiceId === invoice.id ? 'Opening…' : 'Details'}</span>
                <span className="cab-row-amount ui-money">{formatMoney(invoice.totalAmount)}</span>
            </button>
        );
    };

    return (
        <main className="cab">
            {header}

            <div className="cab-body">
                <section className="cab-hero">
                    <div className="cab-hero-text">
                        <span className="cab-hero-eyebrow">
                            {owed > 0 ? `${name}, you owe` : `${name}, you’re all paid up`}
                        </span>
                        <span className="cab-hero-amount">{formatMoney(owed)}</span>
                        <span className="cab-hero-note">
                            {owed > 0
                                ? `${plural(openCount, 'open invoice')}. Balance ${formatMoney(balance)}.`
                                : balance > 0
                                    ? `Nothing owed. You have ${formatMoney(balance)} credit; it pays your next invoices.`
                                    : 'Nothing owed right now.'}
                        </span>
                    </div>
                    {owed > 0 && cabinet.payToken && (
                        <div className="cab-pay">
                            <a className="cab-pay-btn" href={`/pay/${cabinet.payToken}`}>Pay {formatMoney(owed)}</a>
                            <span className="cab-pay-note">From your banking app, settles automatically</span>
                        </div>
                    )}
                </section>

                {error && <Notice tone="red">{error}</Notice>}

                <Tabs<CabinetTab>
                    value={activeTab}
                    onChange={handleTabChange}
                    options={[
                        {value: 'overview', label: 'Overview'},
                        {value: 'invoices', label: 'All invoices'},
                    ]}
                />

                {activeTab === 'overview' ? (
                    <div className="cab-grid">
                        <div className="cab-col">
                            <section className="ui-card">
                                <div className="cab-card-head"><h2 className="ui-section-title">Open invoices</h2></div>
                                {openInvoices.length > 0
                                    ? openInvoices.map((invoice) => renderInvoiceRow(invoice, false))
                                    : <p className="cab-card-empty">Nothing open. Every invoice is paid.</p>}
                            </section>

                            <section className="ui-card">
                                <div className="cab-card-head"><h2 className="ui-section-title">Recent payments</h2></div>
                                {payments === null ? (
                                    <p className="cab-card-empty">Loading…</p>
                                ) : payments.length === 0 ? (
                                    <p className="cab-card-empty">No bank transfers from you yet.</p>
                                ) : payments.map((payment) => (
                                    <div key={payment.id} className="cab-row">
                                        <span className="cab-row-text">
                                            <span className="cab-row-title is-light">
                                                Bank transfer{payment.senderName ? ` from ${payment.senderName}` : ''}
                                            </span>
                                            <span className="cab-row-meta">
                                                {formatWhen(payment.occurredAt)} · {paymentOutcome(payment)}
                                            </span>
                                        </span>
                                        <span className="cab-row-amount is-small is-green ui-money">
                                            {formatMoney(payment.amount)}
                                        </span>
                                    </div>
                                ))}
                            </section>
                        </div>

                        <section className="ui-card">
                            <div className="cab-card-head">
                                <h2 className="ui-section-title">What you’re on · {monthName}</h2>
                            </div>
                            {cabinet.activeSubscriptions.length > 0 ? (
                                <>
                                    {cabinet.activeSubscriptions.map((subscription) => (
                                        <div key={subscription.id} className="cab-row">
                                            <span className="cab-row-text">
                                                <span className="cab-row-title">{subscription.serviceName}</span>
                                                <span className="cab-row-meta">
                                                    Since {formatMonth(subscription.startMonth)}
                                                    {subscription.endMonth && ` · until ${formatMonth(subscription.endMonth)}`}
                                                </span>
                                            </span>
                                            <span className="cab-row-amount is-small is-muted ui-money"
                                                  title={`Your share of the latest ${formatMoney(subscription.servicePrice)} bill`}>
                                                {formatMoney(subscription.monthlyShare)}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="cab-card-foot">
                                        Your share of each service’s latest bill. The exact amount is on each invoice.
                                    </div>
                                </>
                            ) : (
                                <p className="cab-card-empty">You aren’t on any subscriptions right now.</p>
                            )}
                        </section>
                    </div>
                ) : (
                    <section className="ui-card">
                        <div className="cab-card-head">
                            <h2 className="ui-section-title">All invoices</h2>
                            <button
                                type="button"
                                className="ui-link-btn"
                                onClick={() => void fetchInvoices()}
                                disabled={loadingInvoices}
                            >
                                {loadingInvoices ? 'Refreshing…' : 'Refresh'}
                            </button>
                        </div>
                        {loadingInvoices && invoices === null ? (
                            <p className="cab-card-empty">Loading…</p>
                        ) : invoices && invoices.length > 0 ? (
                            invoices.map((invoice) => renderInvoiceRow(invoice, true))
                        ) : (
                            <EmptyState title="No invoices yet">Your first invoice appears here once it is issued.</EmptyState>
                        )}
                    </section>
                )}
            </div>

            <Drawer
                open={Boolean(selectedInvoice)}
                eyebrow="Invoice"
                title={selectedInvoice ? invoiceTitle(selectedInvoice.invoice) : ''}
                onClose={() => setSelectedInvoice(null)}
                flush
            >
                {selectedInvoice && (
                    <>
                        <DrawerSection>
                            <div className="cab-detail-head">
                                <span className="cab-detail-amount ui-money">
                                    {formatMoney(selectedInvoice.invoice.totalAmount)}
                                </span>
                                <Tag tone={statusOf(selectedInvoice.invoice.status).tone}>
                                    {statusOf(selectedInvoice.invoice.status).label}
                                </Tag>
                            </div>
                            <dl className="cab-detail-list">
                                {selectedInvoice.invoice.origin !== 'MANUAL' && (
                                    <>
                                        <dt>Period</dt>
                                        <dd>{formatPeriod(selectedInvoice.invoice.fromMonth, selectedInvoice.invoice.toMonth)}</dd>
                                    </>
                                )}
                                <dt>Invoice date</dt>
                                <dd>{formatDate(selectedInvoice.invoice.invoiceDate)}</dd>
                                {selectedInvoice.invoice.notes && (
                                    <>
                                        <dt>Note</dt>
                                        <dd>{selectedInvoice.invoice.notes}</dd>
                                    </>
                                )}
                            </dl>
                        </DrawerSection>
                        <DrawerSection title="What it covers">
                            {selectedInvoice.entries.length > 0 ? (
                                <div className="cab-entries">
                                    {selectedInvoice.entries.map((entry) => (
                                        <div key={entry.ledgerEntryId} className="cab-entry">
                                            <span className="cab-row-text">
                                                <span className="cab-row-title is-light">{entry.subscriptionServiceName}</span>
                                                <span className="cab-row-meta">
                                                    {formatMonth(entry.recordedMonth)} · {shareLabel(entry)}
                                                </span>
                                            </span>
                                            <span className="ui-money">{formatMoney(entry.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="cab-detail-empty">
                                    A one-off invoice, not tied to subscription costs.
                                </p>
                            )}
                        </DrawerSection>
                        {isOpen(selectedInvoice.invoice) && cabinet.payToken && (
                            <DrawerSection>
                                <a className="ui-btn is-primary is-block" href={`/pay/${cabinet.payToken}`}>
                                    Pay what you owe
                                </a>
                            </DrawerSection>
                        )}
                    </>
                )}
            </Drawer>
        </main>
    );
}
