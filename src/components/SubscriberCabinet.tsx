import {useEffect, useMemo, useState} from 'react';
import {API_CONFIG} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {useEscapeClose} from '../utils/useEscapeClose';
import type {InvoiceDetailResponse, InvoiceResponse, InvoiceStatus} from '../types/invoice';
import type {ActiveSubscriptionDto, SubscriberDetailResponse, UnpaidInvoiceDto} from '../types/subscriber';
import './SubscriberCabinet.css';

interface SubscriberCabinetProps {
    userEmail?: string | null;
    canAccessAdmin?: boolean;
    onLogout?: () => void;
}

type CabinetTab = 'overview' | 'invoices';

const formatMoney = (value: number | string | null | undefined) => {
    const amount = Number(value ?? 0);
    return `₴${amount.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
};

const formatMonth = (value?: string | null) => {
    if (!value) return 'Open';
    const [year, month] = value.split('-');
    if (!year || !month) return value;
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric'
    });
};

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-US') : 'Unknown';

const formatPeriod = (item: Pick<InvoiceResponse, 'fromMonth' | 'toMonth'> | UnpaidInvoiceDto) => {
    if (item.fromMonth === item.toMonth) return formatMonth(item.fromMonth);
    return `${formatMonth(item.fromMonth)} - ${formatMonth(item.toMonth)}`;
};

const getStatusClass = (status: InvoiceStatus | string) => `subscriber-status subscriber-status-${status.toLowerCase()}`;

export default function SubscriberCabinet({userEmail, canAccessAdmin = false, onLogout}: SubscriberCabinetProps) {
    const [cabinet, setCabinet] = useState<SubscriberDetailResponse | null>(null);
    const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetailResponse | null>(null);
    const [activeTab, setActiveTab] = useState<CabinetTab>('overview');
    const [loading, setLoading] = useState(true);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchCabinet();
    }, []);

    const unpaidTotal = useMemo(
        () => cabinet?.unpaidInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0) ?? 0,
        [cabinet]
    );

    const fetchCabinet = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(API_CONFIG.SUBSCRIBER_CABINET_URL, {
                credentials: 'include'
            });

            if (!response.ok) {
                setError(await getResponseErrorMessage(response, 'Failed to load subscriber cabinet'));
                return;
            }

            const data: SubscriberDetailResponse = await response.json();
            setCabinet(data);
        } catch (err) {
            console.error('Failed to load subscriber cabinet:', err);
            setError('Failed to load subscriber cabinet');
        } finally {
            setLoading(false);
        }
    };

    const fetchInvoices = async () => {
        setLoadingInvoices(true);
        setError(null);

        try {
            const response = await fetch(API_CONFIG.SUBSCRIBER_INVOICES_URL, {
                credentials: 'include'
            });

            if (!response.ok) {
                setError(await getResponseErrorMessage(response, 'Failed to load invoices'));
                return;
            }

            const data: InvoiceResponse[] = await response.json();
            setInvoices(data);
        } catch (err) {
            console.error('Failed to load subscriber invoices:', err);
            setError('Failed to load invoices');
        } finally {
            setLoadingInvoices(false);
        }
    };

    const handleTabChange = (tab: CabinetTab) => {
        setActiveTab(tab);
        if (tab === 'invoices' && invoices.length === 0 && !loadingInvoices) {
            fetchInvoices();
        }
    };

    const handleViewInvoice = async (invoiceId: string) => {
        setLoadingInvoiceId(invoiceId);
        setError(null);

        try {
            const response = await fetch(`${API_CONFIG.SUBSCRIBER_INVOICES_URL}/${invoiceId}`, {
                credentials: 'include'
            });

            if (!response.ok) {
                setError(await getResponseErrorMessage(response, 'Failed to load invoice'));
                return;
            }

            const data: InvoiceDetailResponse = await response.json();
            setSelectedInvoice(data);
            setActiveTab('invoices');
        } catch (err) {
            console.error('Failed to load subscriber invoice:', err);
            setError('Failed to load invoice');
        } finally {
            setLoadingInvoiceId(null);
        }
    };

    const renderSubscription = (subscription: ActiveSubscriptionDto) => (
        <div key={subscription.id} className="subscriber-list-row">
            <div>
                <strong>{subscription.serviceName}</strong>
                <span>{formatMonth(subscription.startMonth)} - {formatMonth(subscription.endMonth)}</span>
            </div>
            <b>{formatMoney(subscription.servicePrice)}</b>
        </div>
    );

    const renderInvoiceSummary = (invoice: UnpaidInvoiceDto | InvoiceResponse) => (
        <div key={invoice.id} className="subscriber-invoice-row">
            <div>
                <strong>{formatPeriod(invoice)}</strong>
                <span>Created {formatDate(invoice.createdAt)}</span>
                {invoice.notes && <span>{invoice.notes}</span>}
            </div>
            <div className="subscriber-invoice-meta">
                <span className={getStatusClass(invoice.status)}>{invoice.status}</span>
                <b>{formatMoney(invoice.totalAmount)}</b>
                <button
                    type="button"
                    onClick={() => handleViewInvoice(invoice.id)}
                    disabled={loadingInvoiceId === invoice.id}
                >
                    {loadingInvoiceId === invoice.id ? 'Loading...' : 'Details'}
                </button>
            </div>
        </div>
    );

    useEscapeClose(Boolean(selectedInvoice), () => setSelectedInvoice(null));

    if (loading) {
        return (
            <main className="subscriber-cabinet">
                <div className="subscriber-loading">Loading cabinet...</div>
            </main>
        );
    }

    if (!cabinet) {
        return (
            <main className="subscriber-cabinet">
                <section className="subscriber-error-panel">
                    <h1>Subscriber cabinet</h1>
                    <p>{error ?? 'Cabinet is unavailable.'}</p>
                    <button type="button" onClick={fetchCabinet}>Retry</button>
                </section>
            </main>
        );
    }

    return (
        <main className="subscriber-cabinet">
            <header className="subscriber-header">
                <div>
                    <p>{userEmail ?? cabinet.email}</p>
                    <h1>{cabinet.name}</h1>
                </div>
                <nav className="subscriber-actions" aria-label="Cabinet actions">
                    {canAccessAdmin && <a href="/admin">Admin</a>}
                    <button type="button" onClick={onLogout}>Logout</button>
                </nav>
            </header>

            {error && <div className="subscriber-alert">{error}</div>}

            <section className="subscriber-summary-grid">
                <article>
                    <span>Balance</span>
                    <strong>{formatMoney(cabinet.balance)}</strong>
                </article>
                <article>
                    <span>Total owed</span>
                    <strong>{formatMoney(cabinet.totalAmountOwed)}</strong>
                </article>
                <article>
                    <span>Unpaid invoices</span>
                    <strong>{cabinet.unpaidInvoices.length}</strong>
                    <small>{formatMoney(unpaidTotal)}</small>
                </article>
                <article>
                    <span>Auto-pay invoices</span>
                    <strong>{cabinet.autoPayInvoices ? 'On' : 'Off'}</strong>
                </article>
            </section>

            <div className="subscriber-tabs" role="tablist" aria-label="Subscriber cabinet sections">
                <button
                    type="button"
                    className={activeTab === 'overview' ? 'is-active' : ''}
                    onClick={() => handleTabChange('overview')}
                >
                    Overview
                </button>
                <button
                    type="button"
                    className={activeTab === 'invoices' ? 'is-active' : ''}
                    onClick={() => handleTabChange('invoices')}
                >
                    Invoices
                </button>
            </div>

            {activeTab === 'overview' ? (
                <section className="subscriber-content-grid">
                    <article className="subscriber-panel">
                        <h2>Active subscriptions</h2>
                        {cabinet.activeSubscriptions.length > 0 ? (
                            <div className="subscriber-list">
                                {cabinet.activeSubscriptions.map(renderSubscription)}
                            </div>
                        ) : (
                            <p className="subscriber-empty">No active subscriptions.</p>
                        )}
                    </article>

                    <article className="subscriber-panel">
                        <h2>Unpaid invoices</h2>
                        {cabinet.unpaidInvoices.length > 0 ? (
                            <div className="subscriber-list">
                                {cabinet.unpaidInvoices.map(renderInvoiceSummary)}
                            </div>
                        ) : (
                            <p className="subscriber-empty">No unpaid invoices.</p>
                        )}
                    </article>
                </section>
            ) : (
                <section className="subscriber-content-grid">
                    <article className="subscriber-panel subscriber-panel-wide">
                        <div className="subscriber-panel-heading">
                            <h2>Invoices</h2>
                            <button type="button" onClick={fetchInvoices} disabled={loadingInvoices}>
                                {loadingInvoices ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>

                        {loadingInvoices ? (
                            <p className="subscriber-empty">Loading invoices...</p>
                        ) : invoices.length > 0 ? (
                            <div className="subscriber-list">
                                {invoices.map(renderInvoiceSummary)}
                            </div>
                        ) : (
                            <p className="subscriber-empty">No invoices found.</p>
                        )}
                    </article>

                    {selectedInvoice && (
                        <article className="subscriber-panel subscriber-panel-wide">
                            <div className="subscriber-panel-heading">
                                <h2>Invoice detail</h2>
                                <button type="button" onClick={() => setSelectedInvoice(null)}>Close</button>
                            </div>
                            <div className="subscriber-detail-grid">
                                <div><span>Period</span><strong>{formatPeriod(selectedInvoice.invoice)}</strong></div>
                                <div><span>Total</span><strong>{formatMoney(selectedInvoice.invoice.totalAmount)}</strong></div>
                                <div><span>Status</span><strong>{selectedInvoice.invoice.status}</strong></div>
                                <div><span>Created</span><strong>{formatDate(selectedInvoice.invoice.createdAt)}</strong></div>
                            </div>

                            <h3>Ledger entries</h3>
                            {selectedInvoice.entries.length > 0 ? (
                                <div className="subscriber-ledger-list">
                                    {selectedInvoice.entries.map((entry) => (
                                        <div key={entry.ledgerEntryId} className="subscriber-list-row">
                                            <div>
                                                <strong>{entry.subscriptionServiceName}</strong>
                                                <span>{formatMonth(entry.recordedMonth)} · {entry.participantCount} participant(s)</span>
                                            </div>
                                            <b>{formatMoney(entry.amount)}</b>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="subscriber-empty">No ledger entries for this invoice.</p>
                            )}
                        </article>
                    )}
                </section>
            )}
        </main>
    );
}
