import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';
import {useToast} from '../../components/ToastContext';
import {API_CONFIG} from '../../config/api';
import {EmptyState, Money, PageHeader, Segmented, TableSkeleton, Tag} from '../../ui/components';
import {useConfirm} from '../../ui/confirmContext';
import {currentMonth, formatDate, formatMoney, plural} from '../../ui/format';
import type {
    DraftInvoiceBulkEmailResult,
    InvoiceBulkBalancePaymentResult,
    InvoiceFilterRequest,
    InvoiceOrigin,
    InvoiceResponse,
    InvoiceStatus,
    InvoiceSuggestion
} from '../../types/invoice';
import type {SubscriberResponse} from '../../types/subscriber';
import {useAdminNav} from '../adminNavContext';
import BalancePaymentResultDrawer from './invoices/BalancePaymentResultDrawer';
import GenerationRunsDrawer from './invoices/GenerationRunsDrawer';
import InvoiceDrawer from './invoices/InvoiceDrawer';
import {GenerateDrawer, ManualInvoiceDrawer} from './invoices/InvoiceForms';
import {addMonths, getJson, invoicePeriodLabel, invoiceSubLine, sendJson, statusTone} from './invoices/invoiceUtils';
import './invoices/Invoices.css';
import SubscriberOptions from './SubscriberOptions';

const PAGE_SIZE = 25;

type StatusFilter = 'ALL' | InvoiceStatus;
type DateFilter = 'any' | 'month' | 'quarter' | 'year' | 'custom';

const STATUS_LABELS: Record<StatusFilter, string> = {
    ALL: 'All',
    DRAFT: 'Draft',
    SENT: 'Sent',
    PAID: 'Paid',
    VOID: 'Void',
};

const DATE_LABELS: Record<DateFilter, string> = {
    any: 'Any date',
    month: 'This month',
    quarter: 'Last 3 months',
    year: 'This year',
    custom: 'Custom range…',
};

type Panel =
    | { kind: 'generate' }
    | { kind: 'manual'; source: InvoiceResponse | null }
    | { kind: 'runs' }
    | { kind: 'balance-result'; result: InvoiceBulkBalancePaymentResult };

const dateRange = (filter: DateFilter, customFrom: string, customTo: string) => {
    const month = currentMonth();
    switch (filter) {
        case 'month':
            return {from: `${month}-01`, to: undefined};
        case 'quarter':
            return {from: `${addMonths(month, -2)}-01`, to: undefined};
        case 'year':
            return {from: `${month.slice(0, 4)}-01-01`, to: undefined};
        case 'custom':
            return {from: customFrom || undefined, to: customTo || undefined};
        default:
            return {from: undefined, to: undefined};
    }
};

type Result<T> = { data: T } | { error: string };
type ReferenceData = [Result<SubscriberResponse[]>, Result<InvoiceSuggestion>];

const fetchInvoices = (request: InvoiceFilterRequest) =>
    sendJson<InvoiceResponse[]>(`${API_CONFIG.INVOICES_URL}/filter`, 'POST', request, 'Could not load the invoices.');

const fetchDrafts = () =>
    sendJson<InvoiceResponse[]>(`${API_CONFIG.INVOICES_URL}/filter`, 'POST', {status: 'DRAFT'}, 'Could not load the drafts.');

const fetchReferenceData = (): Promise<ReferenceData> => Promise.all([
    getJson<SubscriberResponse[]>(API_CONFIG.SUBSCRIBERS_URL, 'Could not load subscribers.'),
    getJson<InvoiceSuggestion>(`${API_CONFIG.INVOICES_URL}/suggested-period`, 'Could not load the suggested period.'),
]);

const byNewest = (a: InvoiceResponse, b: InvoiceResponse) =>
    b.invoiceDate.localeCompare(a.invoiceDate)
    || b.toMonth.localeCompare(a.toMonth)
    || b.createdAt.localeCompare(a.createdAt)
    || a.subscriberName.localeCompare(b.subscriberName);

export default function Invoices() {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();
    const {refreshCounts} = useAdminNav();

    const [invoices, setInvoices] = useState<InvoiceResponse[] | null>(null);
    const [drafts, setDrafts] = useState<InvoiceResponse[]>([]);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [suggestion, setSuggestion] = useState<InvoiceSuggestion | null>(null);

    const [status, setStatus] = useState<StatusFilter>('ALL');
    const [subscriberId, setSubscriberId] = useState('');
    const [origin, setOrigin] = useState<'' | InvoiceOrigin>('');
    const [dateFilter, setDateFilter] = useState<DateFilter>('any');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [page, setPage] = useState(0);

    const [selected, setSelected] = useState<InvoiceResponse | null>(null);
    const [panel, setPanel] = useState<Panel | null>(null);
    const [bulkBusy, setBulkBusy] = useState<'email' | 'pay' | null>(null);

    // Status is filtered here, not on the server, so the pills can count every status.
    const request = useMemo<InvoiceFilterRequest>(() => {
        const {from, to} = dateRange(dateFilter, customFrom, customTo);
        return {
            subscriberId: subscriberId || undefined,
            origin: origin || undefined,
            invoiceDateFrom: from,
            invoiceDateTo: to,
        };
    }, [subscriberId, origin, dateFilter, customFrom, customTo]);

    const applyInvoices = useCallback((result: Result<InvoiceResponse[]>) => {
        if ('error' in result) {
            showError('Couldn’t load invoices', result.error);
            setInvoices((previous) => previous ?? []);
            return;
        }
        setInvoices(Array.isArray(result.data) ? [...result.data].sort(byNewest) : []);
    }, [showError]);

    const applyDrafts = useCallback((result: Result<InvoiceResponse[]>) => {
        if ('data' in result) setDrafts(Array.isArray(result.data) ? result.data : []);
    }, []);

    const applyReference = useCallback(([subscriberResult, suggestionResult]: ReferenceData) => {
        if ('data' in subscriberResult) {
            setSubscribers([...subscriberResult.data].sort((a, b) => a.name.localeCompare(b.name)));
        } else {
            showError('Couldn’t load subscribers', subscriberResult.error);
        }
        if ('data' in suggestionResult) setSuggestion(suggestionResult.data);
    }, [showError]);

    const loadInvoices = useCallback(async () => applyInvoices(await fetchInvoices(request)), [request, applyInvoices]);

    // Refetch whenever the filters change; a slower, older response is dropped.
    useEffect(() => {
        let active = true;
        fetchInvoices(request).then((result) => {
            if (active) applyInvoices(result);
        });
        return () => {
            active = false;
        };
    }, [request, applyInvoices]);

    useEffect(() => {
        let active = true;
        fetchDrafts().then((result) => {
            if (active) applyDrafts(result);
        });
        fetchReferenceData().then((result) => {
            if (active) applyReference(result);
        });
        return () => {
            active = false;
        };
    }, [applyDrafts, applyReference]);

    // Other screens ask for a refresh after they settle debt.
    useEffect(() => {
        const handler = () => void loadInvoices();
        window.addEventListener('invoice-refresh-needed', handler);
        return () => window.removeEventListener('invoice-refresh-needed', handler);
    }, [loadInvoices]);

    const refreshAll = useCallback(() => {
        void loadInvoices();
        void fetchDrafts().then(applyDrafts);
        void fetchReferenceData().then(applyReference);
        refreshCounts();
    }, [loadInvoices, applyDrafts, applyReference, refreshCounts]);

    const exemptIds = useMemo(
        () => new Set(subscribers.filter((subscriber) => subscriber.billingExempt).map((subscriber) => subscriber.id)),
        [subscribers]
    );

    const counts = useMemo(() => {
        const result: Record<StatusFilter, number> = {ALL: 0, DRAFT: 0, SENT: 0, PAID: 0, VOID: 0};
        for (const invoice of invoices ?? []) {
            result.ALL += 1;
            result[invoice.status] += 1;
        }
        return result;
    }, [invoices]);

    const visible = useMemo(
        () => (invoices ?? []).filter((invoice) => status === 'ALL' || invoice.status === status),
        [invoices, status]
    );
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    const filtersActive = status !== 'ALL' || Boolean(subscriberId) || Boolean(origin) || dateFilter !== 'any';

    const withPageReset = <T, >(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setPage(0);
    };

    const clearFilters = () => {
        setStatus('ALL');
        setSubscriberId('');
        setOrigin('');
        setDateFilter('any');
        setCustomFrom('');
        setCustomTo('');
        setPage(0);
    };

    const filterSummary = () => {
        const parts: string[] = [];
        if (status !== 'ALL') parts.push(STATUS_LABELS[status]);
        if (subscriberId) parts.push(subscribers.find((s) => s.id === subscriberId)?.name ?? 'One subscriber');
        if (origin) parts.push(origin === 'MANUAL' ? 'Manual' : 'From the ledger');
        if (dateFilter === 'custom') {
            if (customFrom || customTo) {
                parts.push(`${customFrom ? formatDate(customFrom) : '…'} – ${customTo ? formatDate(customTo) : '…'}`);
            }
        } else if (dateFilter !== 'any') {
            parts.push(DATE_LABELS[dateFilter]);
        }
        return parts.join(' · ');
    };

    const handleEmailDrafts = async () => {
        if (drafts.length === 0) return;
        const total = drafts.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
        const shown = drafts.slice(0, 8);
        const text: ReactNode = (
            <>
                Each subscriber gets their invoice with a pay link, and the drafts become sent. {formatMoney(total)} in all.
                <span className="inv-confirm-list">
                    {shown.map((invoice) => (
                        <span key={invoice.id} className="inv-confirm-row">
                            <span>{invoice.subscriberName} · {invoicePeriodLabel(invoice)}</span>
                            <Money value={invoice.totalAmount}/>
                        </span>
                    ))}
                    {drafts.length > shown.length && (
                        <span className="inv-confirm-more">and {drafts.length - shown.length} more</span>
                    )}
                </span>
            </>
        );
        const {confirmed} = await confirm({
            title: `Email ${plural(drafts.length, 'draft invoice')}?`,
            text,
            confirmLabel: `Email ${drafts.length}`,
            tone: 'primary',
        });
        if (!confirmed) return;

        setBulkBusy('email');
        const result = await sendJson<DraftInvoiceBulkEmailResult>(`${API_CONFIG.INVOICES_URL}/drafts/email`, 'POST',
            undefined, 'The drafts could not be emailed.');
        setBulkBusy(null);
        if ('error' in result) {
            showError('Couldn’t email the drafts', result.error);
            return;
        }
        const data = result.data;
        if (data.failedCount > 0) {
            const failed = data.items.filter((item) => !item.sent).map((item) => item.subscriberName);
            showError(`Emailed ${data.sentCount} of ${data.attemptedCount} drafts`, `Not sent: ${failed.join(', ')}`);
        } else {
            showSuccess(
                `Emailed ${plural(data.sentCount, 'draft')}`,
                data.dryRun ? 'Dry run: nothing left the server and the drafts stay drafts.' : `${data.updatedCount} now sent`
            );
        }
        refreshAll();
    };

    const handlePayDrafts = async () => {
        const {confirmed} = await confirm({
            title: 'Pay drafts from balance?',
            text: 'Every draft that its subscriber’s balance fully covers is paid, and the balance goes down by the amount. Drafts the balance doesn’t cover are skipped. No emails are sent.',
            confirmLabel: 'Pay covered drafts',
            tone: 'primary',
        });
        if (!confirmed) return;

        setBulkBusy('pay');
        const result = await sendJson<InvoiceBulkBalancePaymentResult>(
            `${API_CONFIG.INVOICES_URL}/drafts/pay-from-balance`, 'POST', undefined,
            'The drafts could not be paid from balance.'
        );
        setBulkBusy(null);
        if ('error' in result) {
            showError('Couldn’t pay drafts from balance', result.error);
            return;
        }
        const data = result.data;
        const detail = [
            formatMoney(data.totalPaidAmount),
            data.skippedCount > 0 ? `${data.skippedCount} skipped` : null,
            data.failedCount > 0 ? `${data.failedCount} failed` : null,
        ].filter(Boolean).join(' · ');
        if (data.failedCount > 0) showError(`Paid ${data.paidCount} of ${plural(data.attemptedCount, 'draft')}`, detail);
        else showSuccess(`Paid ${data.paidCount} of ${plural(data.attemptedCount, 'draft')} from balance`, detail);
        if (data.attemptedCount > 0) setPanel({kind: 'balance-result', result: data});
        window.dispatchEvent(new CustomEvent('subscriber-refresh-needed'));
        refreshAll();
    };

    const closePanel = () => setPanel(null);
    const finishPanel = () => {
        setPanel(null);
        refreshAll();
    };

    const statusOptions = (Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => ({
        value,
        label: STATUS_LABELS[value],
        count: invoices ? counts[value] : undefined,
    }));

    return (
        <div className="inv-screen">
            <PageHeader
                eyebrow="Billing"
                title="Invoices"
                actions={(
                    <button type="button" className="ui-btn is-primary" onClick={() => setPanel({kind: 'generate'})}>
                        Generate for period
                    </button>
                )}
            />
            <div className="inv-secondary-actions">
                <button type="button" className="ui-btn is-small" onClick={handleEmailDrafts}
                        disabled={drafts.length === 0 || bulkBusy !== null}>
                    {bulkBusy === 'email' ? 'Emailing…' : `Email all drafts (${drafts.length})`}
                </button>
                <button type="button" className="ui-btn is-small" onClick={handlePayDrafts}
                        disabled={drafts.length === 0 || bulkBusy !== null}>
                    {bulkBusy === 'pay' ? 'Paying…' : 'Pay drafts from balance'}
                </button>
                <button type="button" className="ui-btn is-small" onClick={() => setPanel({kind: 'manual', source: null})}>
                    Manual invoice
                </button>
                <button type="button" className="ui-btn is-small" onClick={() => setPanel({kind: 'runs'})}>
                    Generation runs
                </button>
            </div>

            <div className="inv-filters ui-filters">
                <Segmented options={statusOptions} value={status} onChange={withPageReset(setStatus)} ariaLabel="Status"/>
                <select className="ui-select is-compact" value={subscriberId} aria-label="Subscriber"
                        onChange={(event) => withPageReset(setSubscriberId)(event.target.value)}>
                    <option value="">All subscribers</option>
                    <SubscriberOptions subscribers={subscribers}/>
                </select>
                <select className="ui-select is-compact" value={dateFilter} aria-label="Invoice date"
                        onChange={(event) => withPageReset(setDateFilter)(event.target.value as DateFilter)}>
                    {(Object.keys(DATE_LABELS) as DateFilter[]).map((value) => (
                        <option key={value} value={value}>{DATE_LABELS[value]}</option>
                    ))}
                </select>
                {dateFilter === 'custom' && (
                    <span className="inv-date-range">
                        <input type="date" className="ui-input is-compact" value={customFrom}
                               aria-label="Invoice date from" max={customTo || undefined}
                               onChange={(event) => withPageReset(setCustomFrom)(event.target.value)}/>
                        <span className="ui-faint">–</span>
                        <input type="date" className="ui-input is-compact" value={customTo}
                               aria-label="Invoice date to" min={customFrom || undefined}
                               onChange={(event) => withPageReset(setCustomTo)(event.target.value)}/>
                    </span>
                )}
                <select className="ui-select is-compact" value={origin} aria-label="Origin"
                        onChange={(event) => withPageReset(setOrigin)(event.target.value as '' | InvoiceOrigin)}>
                    <option value="">Any origin</option>
                    <option value="SUBSCRIPTION_LEDGER">From the ledger</option>
                    <option value="MANUAL">Manual</option>
                </select>
                {filtersActive && (
                    <button type="button" className="ui-link-btn is-muted" onClick={clearFilters}>Clear filters</button>
                )}
            </div>

            <div className="inv-body">
                {invoices === null ? (
                    <TableSkeleton columns="minmax(0,1fr) 92px minmax(0,1.2fr) 76px 110px" rows={8}/>
                ) : visible.length === 0 ? (
                    filtersActive ? (
                        <EmptyState
                            title="No invoices match these filters"
                            action={<button type="button" className="ui-btn" onClick={clearFilters}>Clear filters</button>}
                        >
                            {filterSummary()}
                        </EmptyState>
                    ) : (
                        <EmptyState
                            title="No invoices yet"
                            action={(
                                <button type="button" className="ui-btn is-primary"
                                        onClick={() => setPanel({kind: 'generate'})}>
                                    Generate for period
                                </button>
                            )}
                        >
                            Generate a period once its costs are calculated, or create a manual invoice.
                        </EmptyState>
                    )
                ) : (
                    <>
                        <div className="ui-table-wrap">
                            <table className="ui-table inv-table">
                                <thead>
                                <tr>
                                    <th>Subscriber</th>
                                    <th>Period</th>
                                    <th>Invoice date</th>
                                    <th>Status</th>
                                    <th className="is-num">Amount</th>
                                </tr>
                                </thead>
                                <tbody>
                                {pageRows.map((invoice) => (
                                    <tr
                                        key={invoice.id}
                                        className={[
                                            'is-clickable',
                                            selected?.id === invoice.id ? 'is-selected' : '',
                                            invoice.status === 'VOID' ? 'is-dim' : '',
                                        ].join(' ')}
                                        onClick={() => setSelected(invoice)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setSelected(invoice);
                                            }
                                        }}
                                        tabIndex={0}
                                    >
                                        <td className="inv-who">{invoice.subscriberName}</td>
                                        <td className="inv-period">{invoicePeriodLabel(invoice)}</td>
                                        <td>
                                            {formatDate(invoice.invoiceDate)}
                                            <span className="ui-cell-sub">
                                                {invoiceSubLine(invoice, exemptIds.has(invoice.subscriberId))}
                                            </span>
                                        </td>
                                        <td><Tag tone={statusTone(invoice.status)}>{invoice.status}</Tag></td>
                                        <td className="is-num inv-amount"><Money value={invoice.totalAmount}/></td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="ui-table-footer">
                            <span>Showing {pageRows.length} of {visible.length}</span>
                            <span className="inv-pager">
                                <span>Page {currentPage + 1} of {pageCount}</span>
                                {currentPage > 0 && (
                                    <button type="button" className="ui-link-btn is-muted"
                                            onClick={() => setPage(currentPage - 1)}>← Previous</button>
                                )}
                                {currentPage < pageCount - 1 && (
                                    <button type="button" className="ui-link-btn"
                                            onClick={() => setPage(currentPage + 1)}>Next →</button>
                                )}
                            </span>
                        </div>
                    </>
                )}
            </div>

            {selected && (
                <InvoiceDrawer
                    key={selected.id}
                    invoice={selected}
                    onClose={() => setSelected(null)}
                    onChanged={refreshAll}
                    onDuplicate={(invoice) => {
                        setSelected(null);
                        setPanel({kind: 'manual', source: invoice});
                    }}
                />
            )}
            {panel?.kind === 'generate' && (
                <GenerateDrawer suggestion={suggestion} subscribers={subscribers} onClose={closePanel} onDone={finishPanel}/>
            )}
            {panel?.kind === 'manual' && (
                <ManualInvoiceDrawer
                    key={panel.source?.id ?? 'new'}
                    source={panel.source}
                    subscribers={subscribers}
                    onClose={closePanel}
                    onDone={finishPanel}
                />
            )}
            {panel?.kind === 'runs' && <GenerationRunsDrawer onClose={closePanel} onChanged={refreshAll}/>}
            {panel?.kind === 'balance-result' && (
                <BalancePaymentResultDrawer result={panel.result} onClose={closePanel}/>
            )}
        </div>
    );
}
