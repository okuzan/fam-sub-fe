import {useCallback, useEffect, useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {API_CONFIG, apiFetch} from '../../config/api';
import {useAdminNav} from '../adminNavContext';
import {useConfirm} from '../../ui/confirmContext';
import {useToast} from '../../components/ToastContext';
import {getResponseErrorMessage} from '../../utils/errors';
import {Dot, EmptyState, Notice, PageHeader, StatStrip, type StatItem, TableSkeleton, Tag} from '../../ui/components';
import {
    currentMonth,
    formatInstantDate,
    formatMoney,
    formatPeriod,
    formatToday,
    formatWhen,
    plural
} from '../../ui/format';
import type {FinanceSummary} from '../../types/finance';
import type {SubscriberResponse} from '../../types/subscriber';
import type {
    DraftInvoiceBulkEmailResult,
    InvoiceGenerationResult,
    InvoiceResponse,
    InvoiceSuggestion
} from '../../types/invoice';
import type {CostCalculationSuggestion} from '../../types/costCalculation';
import type {ChargePageResponse, ChargeResponse} from '../../types/charge';
import type {SubscriptionServiceResponse} from '../../types/subscription';
import type {LedgerEntryResponse} from '../../types/ledger';
import type {BankMatchMethod, BankPaymentsOverview, BankSyncStatus, BankTransactionResponse} from '../../types/bankPayment';
import type {AdminActionResponse} from '../../types/adminAction';
import './Overview.css';
import {useSubscriberNames} from '../subscriberNames';

type TaskTone = 'red' | 'clay' | 'green' | 'slate';

interface Task {
    key: string;
    tone: TaskTone;
    tag: string;
    title: string;
    detail: string;
    amount: number | null;
    action: string;
    /** Either a screen to open, or work to run (then everything is re-read). */
    to?: string;
    run?: () => Promise<void>;
}

interface DoneItem {
    key: string;
    text: string;
    meta: string;
    at: string;
}

interface OverviewData {
    finance: FinanceSummary | null;
    subscribers: SubscriberResponse[];
    invoices: InvoiceResponse[];
    bankReview: BankTransactionResponse[];
    bankApplied: BankTransactionResponse[];
    actions: AdminActionResponse[];
    invoiceSuggestion: InvoiceSuggestion | null;
    uninvoicedEntries: LedgerEntryResponse[];
    costSuggestion: CostCalculationSuggestion | null;
    uncalculatedCharges: ChargeResponse[];
}

const EMPTY_DATA: OverviewData = {
    finance: null,
    subscribers: [],
    invoices: [],
    bankReview: [],
    bankApplied: [],
    actions: [],
    invoiceSuggestion: null,
    uninvoicedEntries: [],
    costSuggestion: null,
    uncalculatedCharges: []
};

const NUMBER_WORDS = ['Nothing', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things',
    'Six things', 'Seven things', 'Eight things', 'Nine things', 'Ten things'];

const headline = (count: number) => {
    if (count === 0) return 'Nothing needs you';
    const subject = NUMBER_WORDS[count] ?? `${count} things`;
    return `${subject} ${count === 1 ? 'needs' : 'need'} you`;
};

const MATCH_WORDS: Record<BankMatchMethod, string> = {
    PAYMENT_CODE: 'matched by payment code',
    NAME: 'matched by name',
    SENDER_RULE: 'known sender',
    ADMIN: 'assigned by admin'
};

// Activity that is noise on the overview, or already shown from the bank feed.
const HIDDEN_ACTIONS = new Set(['BANK_PAYMENTS_SYNCED', 'BANK_PAYMENT_ASSIGNED']);

const UNPAID = new Set(['DRAFT', 'SENT']);

const sum = (values: Array<number | string>) => values.reduce<number>((total, value) => total + Number(value), 0);

const listNames = (names: string[]) => {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** "Today 14:05" → "14:05"; older reads keep their day. */
const readTime = (instant: string | null | undefined) => formatWhen(instant).replace(/^Today /, '');

const byOldest = (a: InvoiceResponse, b: InvoiceResponse) =>
    a.invoiceDate.localeCompare(b.invoiceDate) || a.createdAt.localeCompare(b.createdAt);

const stripIds = (text: string) => text.replace(/\s?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '');

const metric = (action: AdminActionResponse, key: string) => Number(action.metrics?.[key] ?? 0);

function describeAction(action: AdminActionResponse): Pick<DoneItem, 'text' | 'meta'> {
    const period = action.fromMonth && action.toMonth ? formatPeriod(action.fromMonth, action.toMonth) : '';
    switch (action.type) {
        case 'COST_CALCULATION_RUN':
            return {
                text: `Cost calculation for ${period}`,
                meta: `${plural(metric(action, 'chargesProcessed'), 'charge')} → ${plural(metric(action, 'ledgerEntriesCreated'), 'entry', 'entries')}`
            };
        case 'INVOICE_GENERATION_RUN':
            return {
                text: `Invoices generated for ${period}`,
                meta: plural(metric(action, 'invoicesCreated'), 'invoice')
            };
        case 'INVOICE_BULK_EMAIL_SENT':
            return {
                text: 'Draft invoices emailed',
                meta: `${metric(action, 'sentCount')} of ${metric(action, 'attemptedCount')} sent`
            };
        default:
            return {text: stripIds(action.summary), meta: ''};
    }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await apiFetch(url, init);
    if (!response.ok) throw new Error(await getResponseErrorMessage(response, `Request failed (${response.status})`));
    return await response.json() as T;
}

const postJson = <T, >(url: string, body?: unknown) => getJson<T>(url, {
    method: 'POST',
    headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body)
});

async function loadOverview(): Promise<{ data: OverviewData; errors: string[]; bankSync: BankSyncStatus | null }> {
    const errors: string[] = [];
    const attempt = async <T, >(label: string, request: () => Promise<T>, fallback: T): Promise<T> => {
        try {
            return await request();
        } catch (error) {
            errors.push(`${label}: ${error instanceof Error ? error.message : 'failed'}`);
            return fallback;
        }
    };

    const [finance, subscribers, invoices, bankReview, bankApplied, actions, invoiceSuggestion, costSuggestion, services] =
        await Promise.all([
            attempt('Finance summary', () => getJson<FinanceSummary>(API_CONFIG.ADMIN_FINANCE_SUMMARY_URL), null),
            attempt('Subscribers', () => getJson<SubscriberResponse[]>(API_CONFIG.SUBSCRIBERS_URL), []),
            attempt('Invoices', () => getJson<InvoiceResponse[]>(API_CONFIG.INVOICES_URL), []),
            attempt('Bank payments', () => getJson<BankPaymentsOverview>(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}?status=UNMATCHED`), null),
            attempt('Bank payments', () => getJson<BankPaymentsOverview>(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}?status=APPLIED&limit=5`), null),
            attempt('Activity', () => getJson<AdminActionResponse[]>(`${API_CONFIG.ADMIN_ACTIONS_URL}?limit=8`), []),
            attempt('Invoice period', () => getJson<InvoiceSuggestion>(`${API_CONFIG.INVOICES_URL}/suggested-period`), null),
            attempt('Cost period', () => getJson<CostCalculationSuggestion>(`${API_CONFIG.COST_CALCULATIONS_URL}/suggested-period`), null),
            attempt('Services', () => getJson<SubscriptionServiceResponse[]>(API_CONFIG.SUBSCRIPTION_SERVICES_URL), [])
        ]);

    // Ledger entries waiting for an invoice, to size the "not generated" task.
    const uninvoicedEntries = invoiceSuggestion?.suggestedFromMonth && invoiceSuggestion.suggestedToMonth
        ? (await attempt('Ledger', () => postJson<LedgerEntryResponse[]>(`${API_CONFIG.LEDGER_URL}/filter`, {
            fromMonth: invoiceSuggestion.suggestedFromMonth,
            toMonth: invoiceSuggestion.suggestedToMonth
        }), [])).filter((entry) => !entry.invoiceId)
        : [];

    // Charges recorded after the last cost run, up to this month. Charges are
    // only listed per service, newest first, so one short page each is enough.
    let uncalculatedCharges: ChargeResponse[] = [];
    if (costSuggestion) {
        const last = costSuggestion.lastCalculatedToMonth;
        const thisMonth = currentMonth();
        const pages = await Promise.all(services.map((service) => attempt(
            'Charges',
            () => getJson<ChargePageResponse>(`${API_CONFIG.CHARGES_URL}/service/${service.id}?page=0&size=12`),
            null
        )));
        uncalculatedCharges = pages
            .flatMap((page) => page?.content ?? [])
            .filter((charge) => (!last || charge.chargeMonth > last) && charge.chargeMonth <= thisMonth);
    }

    return {
        data: {
            finance,
            subscribers,
            invoices,
            bankReview: bankReview?.transactions ?? [],
            bankApplied: bankApplied?.transactions ?? [],
            actions,
            invoiceSuggestion,
            uninvoicedEntries,
            costSuggestion,
            uncalculatedCharges
        },
        errors: Array.from(new Set(errors)),
        bankSync: bankReview?.sync ?? bankApplied?.sync ?? null
    };
}

export default function Overview() {
    const names = useSubscriberNames();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const {showSuccess, showError} = useToast();
    const {bankSync: navBankSync, refreshCounts, setOverviewCount} = useAdminNav();

    const [data, setData] = useState<OverviewData>(EMPTY_DATA);
    const [bankSync, setBankSync] = useState<BankSyncStatus | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        const result = await loadOverview();
        setData(result.data);
        setBankSync(result.bankSync);
        setErrors(result.errors);
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void loadOverview().then((result) => {
            if (cancelled) return;
            setData(result.data);
            setBankSync(result.bankSync);
            setErrors(result.errors);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const runTask = useCallback(async (key: string, work: () => Promise<void>) => {
        setBusyKey(key);
        try {
            await work();
        } catch (error) {
            showError('Action failed', error instanceof Error ? error.message : undefined);
        } finally {
            setBusyKey(null);
            await load();
            refreshCounts();
        }
    }, [load, refreshCounts, showError]);

    const tasks = useMemo<Task[]>(() => {
        const list: Task[] = [];
        const {finance, subscribers, invoices, bankReview, invoiceSuggestion, uninvoicedEntries, uncalculatedCharges} = data;

        // 1. Bank transfers nobody could match.
        if (bankReview.length > 0) {
            const senders = Array.from(new Set(bankReview.map((transaction) => transaction.senderName || 'an unknown sender')));
            list.push({
                key: 'bank',
                tone: 'red',
                tag: 'Bank',
                title: `${plural(bankReview.length, 'bank payment')} ${bankReview.length === 1 ? 'needs' : 'need'} review`,
                detail: `${bankReview.length === 1 ? 'A transfer' : 'Transfers'} from ${listNames(senders)} could not be matched to a subscriber automatically.`,
                amount: sum(bankReview.map((transaction) => transaction.amount)),
                action: 'Review',
                to: '/admin/bank-payments'
            });
        }

        // 2. Ledger months that have no invoices yet.
        const fromMonth = invoiceSuggestion?.suggestedFromMonth;
        const toMonth = invoiceSuggestion?.suggestedToMonth ?? fromMonth;
        if (fromMonth && toMonth) {
            const period = formatPeriod(fromMonth, toMonth);
            const subscriberCount = new Set(uninvoicedEntries.map((entry) => entry.subscriberId)).size;
            const writtenAt = uninvoicedEntries.reduce<string | null>(
                (latest, entry) => (!latest || entry.calculatedAt > latest ? entry.calculatedAt : latest), null);
            list.push({
                key: 'generate',
                tone: 'red',
                tag: 'Next step',
                title: `${period} invoices not generated`,
                detail: uninvoicedEntries.length > 0
                    ? `Ledger written ${formatInstantDate(writtenAt)}: ${plural(uninvoicedEntries.length, 'entry', 'entries')} for ${plural(subscriberCount, 'subscriber')}. Generating creates drafts; exempt family get theirs already paid.`
                    : 'The ledger has entries that are not on any invoice yet.',
                amount: uninvoicedEntries.length > 0 ? sum(uninvoicedEntries.map((entry) => entry.amount)) : null,
                action: 'Generate',
                run: async () => {
                    const {confirmed} = await confirm({
                        title: `Generate ${period} invoices?`,
                        text: 'Creates one draft invoice per subscriber from the uninvoiced ledger. Nothing is emailed yet.',
                        confirmLabel: 'Generate',
                        tone: 'primary'
                    });
                    if (!confirmed) return;
                    const result = await postJson<InvoiceGenerationResult>(`${API_CONFIG.INVOICES_URL}/generate`, {
                        fromMonth,
                        toMonth,
                        sendEmail: false
                    });
                    showSuccess(
                        `Generated ${plural(result.invoicesCreated, 'invoice')}`,
                        [
                            `${formatMoney(result.totalAmount)} from ${plural(result.ledgerEntriesAssigned, 'ledger entry', 'ledger entries')}`,
                            result.paidFromBalanceCount > 0 ? `${result.paidFromBalanceCount} paid from credit` : null
                        ].filter(Boolean).join(' · ')
                    );
                }
            });
        }

        // 3. Charges recorded after the last cost run.
        if (uncalculatedCharges.length > 0) {
            const months = Array.from(new Set(uncalculatedCharges.map((charge) => charge.chargeMonth))).sort();
            const period = formatPeriod(months[0], months[months.length - 1]);
            list.push({
                key: 'costs',
                tone: 'red',
                tag: 'Next step',
                title: `${period} costs not calculated`,
                detail: `${plural(uncalculatedCharges.length, 'charge')} recorded, but no cost run covers ${months.length === 1 ? 'that month' : 'those months'} yet.`,
                amount: sum(uncalculatedCharges.map((charge) => charge.amount)),
                action: 'Open ledger',
                to: '/admin/ledger'
            });
        }

        // 4. Drafts that never went out.
        const drafts = invoices.filter((invoice) => invoice.status === 'DRAFT').sort(byOldest);
        if (drafts.length > 0) {
            const periods = Array.from(new Set(drafts.map((invoice) => formatPeriod(invoice.fromMonth, invoice.toMonth))));
            const oldestCreated = drafts.reduce((oldest, invoice) => (invoice.createdAt < oldest ? invoice.createdAt : oldest), drafts[0].createdAt);
            list.push({
                key: 'drafts',
                tone: 'clay',
                tag: 'Stalled',
                title: periods.length === 1
                    ? `${drafts.length} ${periods[0]} ${drafts.length === 1 ? 'draft' : 'drafts'} never emailed`
                    : `${plural(drafts.length, 'draft')} never emailed`,
                detail: `Oldest created ${formatInstantDate(oldestCreated)}. Subscribers see an invoice only after it’s emailed.`,
                amount: sum(drafts.map((invoice) => invoice.totalAmount)),
                action: 'Email all drafts',
                run: async () => {
                    const {confirmed} = await confirm({
                        title: `Email ${plural(drafts.length, 'draft invoice')}?`,
                        text: 'Each subscriber gets their invoice with a pay link, and the drafts become sent.',
                        confirmLabel: 'Email all drafts',
                        tone: 'primary'
                    });
                    if (!confirmed) return;
                    const result = await postJson<DraftInvoiceBulkEmailResult>(`${API_CONFIG.INVOICES_URL}/drafts/email`);
                    const detail = [
                        result.failedCount > 0 ? `${result.failedCount} failed` : '',
                        result.dryRun ? 'Dry run: statuses unchanged' : ''
                    ].filter(Boolean).join(' · ');
                    if (result.failedCount > 0 && result.sentCount === 0) {
                        showError('No drafts were emailed', detail);
                    } else {
                        showSuccess(`Emailed ${result.sentCount} of ${result.attemptedCount} drafts`, detail || undefined);
                    }
                }
            });
        }

        // 5. Balances that already cover open invoices (oldest first, skipping any that don't fit).
        for (const subscriber of subscribers) {
            const balance = Number(subscriber.balance);
            if (subscriber.billingExempt || !(balance > 0)) continue;
            const open = invoices
                .filter((invoice) => invoice.subscriberId === subscriber.id && UNPAID.has(invoice.status))
                .sort(byOldest);
            let remaining = balance;
            const covered: InvoiceResponse[] = [];
            for (const invoice of open) {
                if (Number(invoice.totalAmount) <= remaining + 0.000001) {
                    covered.push(invoice);
                    remaining -= Number(invoice.totalAmount);
                }
            }
            if (covered.length === 0) continue;
            const amounts = covered.map((invoice) => formatMoney(invoice.totalAmount));
            list.push({
                key: `balance-${subscriber.id}`,
                tone: 'green',
                tag: 'Easy win',
                title: `${subscriber.name}’s balance covers ${plural(covered.length, 'open invoice')}`,
                detail: `${formatMoney(balance)} on the balance covers the ${listNames(amounts)} ${covered.length === 1 ? 'invoice' : 'invoices'} in full.`,
                amount: sum(covered.map((invoice) => invoice.totalAmount)),
                action: 'Pay from balance',
                run: async () => {
                    const {confirmed} = await confirm({
                        title: `Pay ${plural(covered.length, 'invoice')} from ${subscriber.name}’s balance?`,
                        text: `${formatMoney(sum(covered.map((invoice) => invoice.totalAmount)))} moves from the balance and the invoices become paid.`,
                        confirmLabel: 'Pay from balance',
                        tone: 'primary'
                    });
                    if (!confirmed) return;
                    let paid = 0;
                    for (const invoice of covered) {
                        await postJson<InvoiceResponse>(`${API_CONFIG.INVOICES_URL}/${invoice.id}/pay-from-balance`);
                        paid += 1;
                    }
                    showSuccess(`Paid ${plural(paid, 'invoice')} from ${subscriber.name}’s balance`);
                }
            });
        }

        // 6. The invoice that has been open longest.
        const oldest = finance?.oldestUnpaidInvoice;
        if (oldest) {
            const debtor = finance.debtors.find((entry) => entry.subscriberId === oldest.subscriberId);
            const theirOpen = invoices.filter((invoice) => invoice.subscriberId === oldest.subscriberId && UNPAID.has(invoice.status));
            const lastSent = theirOpen.reduce<string | null>(
                (latest, invoice) => (invoice.sentAt && (!latest || invoice.sentAt > latest) ? invoice.sentAt : latest), null);
            const openCount = debtor?.unpaidInvoiceCount ?? theirOpen.length;
            list.push({
                key: 'oldest',
                tone: 'slate',
                tag: 'Oldest',
                title: `${names.short(oldest.subscriberId, oldest.subscriberName)} · invoice open ${plural(oldest.ageDays, 'day')}`,
                detail: `${plural(openCount, 'open invoice')}. ${lastSent ? `Last emailed ${formatInstantDate(lastSent)}.` : 'Never emailed.'}`,
                amount: debtor?.unpaidInvoiceAmount ?? oldest.amount,
                action: 'Email situation',
                run: async () => {
                    const {confirmed} = await confirm({
                        title: `Email ${oldest.subscriberName} their situation?`,
                        text: 'They get a summary of every open invoice and what they owe in total.',
                        confirmLabel: 'Send email',
                        tone: 'primary'
                    });
                    if (!confirmed) return;
                    const result = await postJson<{ message?: string }>(`${API_CONFIG.SUBSCRIBERS_URL}/${oldest.subscriberId}/email-situation`);
                    showSuccess('Situation email sent', result.message);
                }
            });
        }

        return list;
    }, [confirm, data, names, showError, showSuccess]);

    useEffect(() => {
        if (!loading) setOverviewCount(tasks.length);
    }, [loading, setOverviewCount, tasks.length]);

    const done = useMemo<DoneItem[]>(() => {
        const fromBank = data.bankApplied.map((transaction) => ({
            key: `bank-${transaction.id}`,
            text: `${transaction.subscriberName ? names.short(transaction.subscriberId, transaction.subscriberName) : 'Someone'} paid ${formatMoney(transaction.amount)}${
                transaction.matchMethod ? ` · ${MATCH_WORDS[transaction.matchMethod]}` : ''}`,
            meta: transaction.settledInvoiceCount > 0
                ? `settled ${plural(transaction.settledInvoiceCount, 'invoice')}`
                : 'added to balance',
            at: transaction.resolvedAt ?? transaction.occurredAt
        }));
        const fromActions = data.actions
            .filter((action) => !HIDDEN_ACTIONS.has(action.type))
            .map((action) => ({key: `action-${action.id}`, ...describeAction(action), at: action.createdAt}));
        return [...fromBank, ...fromActions]
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            .slice(0, 6);
    }, [data.actions, data.bankApplied, names]);

    const finance = data.finance;
    const sync = bankSync ?? navBankSync;
    const oldest = finance?.oldestUnpaidInvoice ?? null;

    const bankTile: StatItem = (() => {
        if (!sync) return {label: 'Bank read', value: '—', note: 'Status unknown'};
        if (!sync.configured) return {label: 'Bank read', value: 'Off', note: 'Monobank is not configured'};
        if (sync.lastError) {
            const reason = sync.lastError.length > 60 ? `${sync.lastError.slice(0, 57)}…` : sync.lastError;
            return {
                label: 'Bank sync failing',
                value: readTime(sync.lastSuccessAt ?? sync.syncedTo),
                note: `Last good read · ${reason}`,
                alert: true,
                onClick: () => navigate('/admin/bank-payments')
            };
        }
        return {
            label: 'Bank read',
            value: readTime(sync.syncedTo),
            note: sync.syncEnabled ? 'Auto every 5 min' : 'Automatic sync is off'
        };
    })();

    const strip: StatItem[] = [
        {
            label: 'Net outstanding',
            value: finance ? formatMoney(finance.netOutstandingDebt) : '—',
            note: finance ? `After ${formatMoney(finance.balanceAppliedToDebt)} of balances` : undefined
        },
        {
            label: 'Unpaid invoices',
            value: finance ? String(finance.unpaidInvoiceCount) : '—',
            note: finance ? formatMoney(finance.unpaidInvoiceAmount) : undefined
        },
        {
            label: 'Oldest unpaid',
            value: oldest ? plural(oldest.ageDays, 'day') : 'None',
            note: oldest ? `${names.short(oldest.subscriberId, oldest.subscriberName)} · ${formatMoney(oldest.amount)}` : 'Every invoice is paid',
            tone: oldest ? 'red' : undefined
        },
        bankTile
    ];

    const situation = (() => {
        if (loading) return 'Reading the ledger, invoices and bank…';
        const invoiceTask = tasks.find((task) => task.key === 'generate');
        const fromMonth = data.invoiceSuggestion?.suggestedFromMonth;
        if (invoiceTask && fromMonth) {
            const period = formatPeriod(fromMonth, data.invoiceSuggestion?.suggestedToMonth ?? fromMonth);
            return `The ${period} ledger is written. Its invoices haven’t been generated yet.`;
        }
        if (tasks.some((task) => task.key === 'costs')) return 'New charges are in. Their costs haven’t been calculated yet.';
        if (data.bankReview.length > 0) return `${plural(data.bankReview.length, 'bank payment')} could not be matched on their own.`;
        if (tasks.some((task) => task.key === 'drafts')) return 'Invoices are drafted but subscribers haven’t been emailed.';
        if (tasks.length === 0) return 'Ledger, invoices and bank are all caught up.';
        if (finance) return `${formatMoney(finance.netOutstandingDebt)} is outstanding across ${plural(finance.debtorCount, 'debtor')}.`;
        return 'A few small things are waiting.';
    })();

    return (
        <>
            <PageHeader
                ruled
                eyebrow={formatToday()}
                title={loading ? 'Overview' : headline(tasks.length)}
                lead={situation}
                actions={<Link to="/admin/subscribers" className="ui-btn">Add subscriber</Link>}
            />

            <StatStrip items={strip}/>

            <div className="ov-body">
                {errors.length > 0 && (
                    <Notice tone="red">
                        Some data did not load, so the list may be incomplete. {errors.join(' · ')}
                    </Notice>
                )}

                <section className="ov-section">
                    <div className="ov-section-head">
                        <h2 className="ui-section-title">Needs action</h2>
                        <span className="ov-section-note">Most urgent first</span>
                    </div>
                    {loading ? (
                        <TableSkeleton columns="10px 1fr 110px 150px" rows={4}/>
                    ) : tasks.length === 0 ? (
                        <EmptyState title="All caught up">
                            Bank payments are matched, invoices are out and nothing is waiting on you.
                        </EmptyState>
                    ) : (
                        <div className="ov-tasks">
                            {tasks.map((task) => (
                                <div key={task.key} className="ov-task">
                                    <Dot tone={task.tone}/>
                                    <div className="ov-task-text">
                                        <div className="ov-task-title-row">
                                            <span className="ov-task-title">{task.title}</span>
                                            <Tag tone={task.tone}>{task.tag}</Tag>
                                        </div>
                                        <span className="ov-task-detail">{task.detail}</span>
                                    </div>
                                    <div className="ov-task-side">
                                        <span className="ov-task-amount">
                                            {task.amount === null ? '' : formatMoney(task.amount)}
                                        </span>
                                        <button
                                            type="button"
                                            className="ui-btn is-small ov-task-btn"
                                            disabled={busyKey !== null}
                                            onClick={() => {
                                                if (task.to) navigate(task.to);
                                                else if (task.run) void runTask(task.key, task.run);
                                            }}
                                        >
                                            {busyKey === task.key ? 'Working…' : task.action}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {!loading && done.length > 0 && (
                    <section className="ov-section">
                        <h2 className="ui-section-title ov-done-title">Recently done</h2>
                        {done.map((item) => (
                            <div key={item.key} className="ov-done">
                                <span className="ov-done-text">{item.text}</span>
                                <span className="ov-done-meta">{item.meta}</span>
                                <span className="ov-done-when">{formatWhen(item.at).replace(/^Today /, '')}</span>
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </>
    );
}
