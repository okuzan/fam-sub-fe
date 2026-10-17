import {useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {getResponseErrorMessage} from '../../utils/errors';
import {useToast} from '../../components/ToastContext';
import {Drawer, DrawerSection, EmptyState, Field, PageHeader, TableSkeleton, Tag, type Tone} from '../../ui/components';
import {formatInstantDate, formatPeriod, formatTime, kyivDayMonth, plural} from '../../ui/format';
import type {AccountResponse} from '../../types/account';
import type {SubscriberResponse} from '../../types/subscriber';
import {
    type AdminActionFilterRequest,
    type AdminActionResponse,
    AdminActionTargetType,
    AdminActionType,
} from '../../types/adminAction';
import './ActivityLog.css';
import {fullName} from '../subscriberNames';

/** The backend caps one request at 200 rows; paging is done here. */
const FETCH_LIMIT = 200;
const PAGE_SIZE = 25;

type RangeOption = '7' | '30' | '90' | 'all' | 'custom';

const RANGE_LABEL: Record<RangeOption, string> = {
    '7': 'Last 7 days',
    '30': 'Last 30 days',
    '90': 'Last 90 days',
    all: 'All time',
    custom: 'Custom dates',
};

interface ActionMeta {
    /** Full name for the filter. */
    label: string;
    /** Short name for the tag. */
    tag: string;
    tone: Tone;
}

// Families: invoices slate, bank clay, costs green, voids/deletes/undos red, the rest grey.
const ACTION_META: Record<AdminActionType, ActionMeta> = {
    COST_CALCULATION_RUN: {label: 'Cost calculation run', tag: 'Cost calculation', tone: 'green'},
    COST_CALCULATION_RUN_UNDONE: {label: 'Cost calculation undone', tag: 'Cost run undone', tone: 'red'},
    INVOICE_GENERATION_RUN: {label: 'Invoice generation run', tag: 'Invoice generation', tone: 'slate'},
    INVOICE_GENERATION_RUN_UNDONE: {label: 'Invoice generation undone', tag: 'Invoice run undone', tone: 'red'},
    MANUAL_INVOICE_CREATED: {label: 'Manual invoice created', tag: 'Manual invoice', tone: 'slate'},
    INVOICE_DUPLICATED: {label: 'Invoice duplicated', tag: 'Invoice copy', tone: 'slate'},
    INVOICE_MARKED_PAID: {label: 'Invoice marked paid', tag: 'Invoice paid', tone: 'slate'},
    INVOICE_STATUS_UPDATED: {label: 'Invoice status changed', tag: 'Invoice status', tone: 'slate'},
    INVOICE_PAID_FROM_BALANCE: {label: 'Invoice paid from balance', tag: 'Paid from balance', tone: 'slate'},
    INVOICE_BULK_PAID_FROM_BALANCE: {label: 'Invoices paid from balance', tag: 'Paid from balance', tone: 'slate'},
    INVOICE_EMAIL_SENT: {label: 'Invoice email sent', tag: 'Invoice email', tone: 'slate'},
    INVOICE_BULK_EMAIL_SENT: {label: 'Invoice emails sent in bulk', tag: 'Invoice emails', tone: 'slate'},
    INVOICE_VOIDED: {label: 'Invoice voided', tag: 'Invoice void', tone: 'red'},
    INVOICE_DELETED: {label: 'Invoice deleted', tag: 'Invoice deleted', tone: 'red'},
    INVOICE_NOTES_UPDATED: {label: 'Invoice notes changed', tag: 'Invoice notes', tone: 'slate'},
    SUBSCRIBER_CREATED: {label: 'Subscriber added', tag: 'Subscriber added', tone: 'grey'},
    SUBSCRIBER_UPDATED: {label: 'Subscriber edited', tag: 'Subscriber edited', tone: 'grey'},
    SUBSCRIBER_DELETED: {label: 'Subscriber deleted', tag: 'Subscriber deleted', tone: 'red'},
    SUBSCRIBER_SITUATION_EMAIL_SENT: {label: 'Situation email sent', tag: 'Situation email', tone: 'slate'},
    SUBSCRIBER_DEBT_PAID: {label: 'Subscriber debt paid', tag: 'Debt paid', tone: 'slate'},
    CHARGE_CREATED: {label: 'Charge added', tag: 'Charge', tone: 'grey'},
    CHARGE_UPDATED: {label: 'Charge edited', tag: 'Charge edited', tone: 'grey'},
    CHARGE_DELETED: {label: 'Charge deleted', tag: 'Charge deleted', tone: 'red'},
    MEMBERSHIP_CREATED: {label: 'Membership added', tag: 'Membership', tone: 'grey'},
    MEMBERSHIP_UPDATED: {label: 'Membership edited', tag: 'Membership edited', tone: 'grey'},
    MEMBERSHIP_ENDED: {label: 'Membership ended', tag: 'Membership ended', tone: 'grey'},
    MEMBERSHIP_DELETED: {label: 'Membership deleted', tag: 'Membership deleted', tone: 'red'},
    SUBSCRIPTION_SERVICE_CREATED: {label: 'Service added', tag: 'Service', tone: 'grey'},
    SUBSCRIPTION_SERVICE_UPDATED: {label: 'Service edited', tag: 'Service edited', tone: 'grey'},
    SUBSCRIPTION_SERVICE_DELETED: {label: 'Service deleted', tag: 'Service deleted', tone: 'red'},
    PINNED_POST_GENERATED: {label: 'Pinned post generated (retired)', tag: 'Pinned post', tone: 'grey'},
    ACCOUNT_DELETED: {label: 'Account deleted', tag: 'Account deleted', tone: 'red'},
    ADMIN_INVITE_CREATED: {label: 'Admin invited', tag: 'Admin invite', tone: 'grey'},
    ADMIN_INVITE_ACCEPTED: {label: 'Admin invite accepted', tag: 'Invite accepted', tone: 'grey'},
    ADMIN_INVITE_REVOKED: {label: 'Admin invite revoked', tag: 'Invite revoked', tone: 'grey'},
    BANK_PAYMENTS_SYNCED: {label: 'Bank synced', tag: 'Bank sync', tone: 'clay'},
    BANK_PAYMENT_ASSIGNED: {label: 'Bank payment applied', tag: 'Bank payment', tone: 'clay'},
    BANK_PAYMENT_IGNORED: {label: 'Bank payment ignored', tag: 'Bank ignored', tone: 'clay'},
    BANK_PAYMENT_UNDONE: {label: 'Bank payment undone', tag: 'Bank undone', tone: 'clay'},
    BANK_SENDER_FORGOTTEN: {label: 'Bank sender forgotten', tag: 'Bank sender', tone: 'clay'},
};

const TARGET_LABEL: Record<AdminActionTargetType, string> = {
    COST_CALCULATION_RUN: 'Cost calculation run',
    INVOICE_GENERATION_RUN: 'Invoice generation run',
    INVOICE: 'Invoice',
    SUBSCRIBER: 'Subscriber',
    CHARGE: 'Charge',
    MEMBERSHIP: 'Membership',
    SUBSCRIPTION_SERVICE: 'Service',
    PINNED_POST: 'Pinned post',
    ACCOUNT: 'Account',
    ADMIN_INVITE: 'Admin invite',
    BANK_TRANSACTION: 'Bank transaction',
    BANK_SENDER: 'Bank sender',
};

const metaFor = (type: string): ActionMeta =>
    ACTION_META[type as AdminActionType] ?? {label: humanize(type), tag: humanize(type), tone: 'grey'};

/** "SOME_KEY" or "someKey" → "Some key". */
const humanize = (value: string) => {
    const spaced = value.includes('_')
        ? value.toLowerCase().replace(/_/g, ' ')
        : value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const YEAR = new Intl.DateTimeFormat('en-GB', {year: 'numeric', timeZone: 'Europe/Kyiv'});

/** "16 Oct 10:21", with the year when it isn't this year. */
const formatLogTime = (instant: string) => {
    const date = new Date(instant);
    const year = YEAR.format(date) !== YEAR.format(new Date()) ? ` ${YEAR.format(date)}` : '';
    return `${kyivDayMonth(date)}${year} ${formatTime(instant)}`;
};

const formatMetric = (value: unknown) => {
    if (value == null) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('en-GB') : value.toFixed(2);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

/** A local date input "2026-10-01" → the start (or end) of that day as an instant. */
const dayBoundary = (date: string, end: boolean) => {
    if (!date) return undefined;
    const parsed = new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

interface AdvancedFilters {
    targetType: AdminActionTargetType | '';
    targetId: string;
    subscriberId: string;
    createdByAccountId: string;
    dateFrom: string;
    dateTo: string;
    fromMonth: string;
    toMonth: string;
}

const EMPTY_ADVANCED: AdvancedFilters = {
    targetType: '',
    targetId: '',
    subscriberId: '',
    createdByAccountId: '',
    dateFrom: '',
    dateTo: '',
    fromMonth: '',
    toMonth: '',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const countAdvanced = (filters: AdvancedFilters) =>
    [filters.targetType, filters.targetId, filters.subscriberId, filters.createdByAccountId, filters.fromMonth,
        filters.toMonth].filter(Boolean).length;

export default function ActivityLog() {
    const {showError} = useToast();
    const [actions, setActions] = useState<AdminActionResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionType, setActionType] = useState<AdminActionType | ''>('');
    const [range, setRange] = useState<RangeOption>('30');
    const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED);
    const [draft, setDraft] = useState<AdvancedFilters>(EMPTY_ADVANCED);
    const [draftError, setDraftError] = useState<string | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<AdminActionResponse | null>(null);
    const [accounts, setAccounts] = useState<AccountResponse[]>([]);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);

    // Who's who, for the Admin column and the filter pickers. Failing quietly
    // just leaves raw emails or ids.
    useEffect(() => {
        const load = async () => {
            try {
                const [accountsResponse, subscribersResponse] = await Promise.all([
                    apiFetch(API_CONFIG.ADMIN_ACCOUNTS_URL),
                    apiFetch(API_CONFIG.SUBSCRIBERS_URL),
                ]);
                if (accountsResponse.ok) setAccounts(await accountsResponse.json());
                if (subscribersResponse.ok) setSubscribers(await subscribersResponse.json());
            } catch (err) {
                console.error(err);
            }
        };
        void load();
    }, []);

    const request = useMemo((): AdminActionFilterRequest => {
        let dateFrom: string | undefined;
        let dateTo: string | undefined;
        if (range === 'custom') {
            dateFrom = dayBoundary(advanced.dateFrom, false);
            dateTo = dayBoundary(advanced.dateTo, true);
        } else if (range !== 'all') {
            const from = new Date();
            from.setDate(from.getDate() - Number(range));
            dateFrom = from.toISOString();
        }
        return {
            actionType: actionType || undefined,
            targetType: advanced.targetType || undefined,
            targetId: advanced.targetId.trim() || undefined,
            subscriberId: advanced.subscriberId || undefined,
            createdByAccountId: advanced.createdByAccountId || undefined,
            dateFrom,
            dateTo,
            fromMonth: advanced.fromMonth || undefined,
            toMonth: advanced.toMonth || undefined,
            limit: FETCH_LIMIT,
        };
    }, [actionType, range, advanced]);

    const fetchActions = useCallback(async (filter: AdminActionFilterRequest) => {
        setLoading(true);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_ACTIONS_URL}/filter`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(filter),
            });
            if (!response.ok) {
                showError(await getResponseErrorMessage(response, 'Could not load the activity log'));
                setActions([]);
                return;
            }
            setActions(await response.json());
            setPage(0);
        } catch (err) {
            console.error(err);
            showError('Could not load the activity log');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        void fetchActions(request);
    }, [fetchActions, request]);

    const emailById = useMemo(
        () => Object.fromEntries(accounts.map((account) => [account.id, account.email])),
        [accounts]
    );
    const nameByEmail = useMemo(
        () => Object.fromEntries(subscribers.map((s) => [s.email.toLowerCase(), s.name])),
        [subscribers]
    );
    const subscriberName = useMemo(
        () => Object.fromEntries(subscribers.map((s) => [s.id, fullName(s)])),
        [subscribers]
    );

    /** A short name for the Admin column: their first name, else the email's local part. */
    const adminName = (accountId: string) => {
        const email = emailById[accountId];
        if (!email) return 'Deleted';
        const name = nameByEmail[email.toLowerCase()];
        return name ? name.split(' ')[0] : email.split('@')[0];
    };

    const adminFull = (accountId: string) => {
        const email = emailById[accountId];
        if (!email) return `Deleted account · ${accountId}`;
        const name = nameByEmail[email.toLowerCase()];
        return name ? `${name} · ${email}` : email;
    };

    const pageCount = Math.max(1, Math.ceil(actions.length / PAGE_SIZE));
    const visible = actions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const capped = actions.length >= FETCH_LIMIT;
    const totalLabel = capped ? `${FETCH_LIMIT}+` : String(actions.length);
    const advancedCount = countAdvanced(advanced);

    const openFilters = () => {
        setDraft(advanced);
        setDraftError(null);
        setFiltersOpen(true);
    };

    const applyFilters = () => {
        if (draft.targetId.trim() && !UUID_PATTERN.test(draft.targetId.trim())) {
            setDraftError('Target id must be a full id, like 3f2a…-…');
            return;
        }
        setAdvanced(draft);
        if (draft.dateFrom || draft.dateTo) setRange('custom');
        else if (range === 'custom') setRange('30');
        setFiltersOpen(false);
    };

    const clearFilters = () => {
        setDraft(EMPTY_ADVANCED);
        setAdvanced(EMPTY_ADVANCED);
        if (range === 'custom') setRange('30');
        setFiltersOpen(false);
    };

    const updateDraft = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => {
        setDraft((previous) => ({...previous, [key]: value}));
        if (key === 'targetId') setDraftError(null);
    };

    const sortedAccounts = useMemo(
        () => [...accounts].filter((a) => a.roles.includes('ADMIN')).sort((a, b) => a.email.localeCompare(b.email)),
        [accounts]
    );
    const sortedSubscribers = useMemo(
        () => [...subscribers].sort((a, b) => a.name.localeCompare(b.name)),
        [subscribers]
    );

    return (
        <div className="log">
            <PageHeader eyebrow="System" title="Activity log"/>

            <div className="log-filters ui-filters">
                <select
                    className="ui-select is-compact log-type-select"
                    value={actionType}
                    onChange={(event) => setActionType(event.target.value as AdminActionType | '')}
                    aria-label="Action type"
                >
                    <option value="">All actions</option>
                    {(Object.keys(ACTION_META) as AdminActionType[]).map((type) => (
                        <option key={type} value={type}>{ACTION_META[type].label}</option>
                    ))}
                </select>
                <select
                    className="ui-select is-compact log-range-select"
                    value={range}
                    onChange={(event) => {
                        const next = event.target.value as RangeOption;
                        if (next === 'custom') {
                            openFilters();
                            return;
                        }
                        setRange(next);
                        setAdvanced((previous) => ({...previous, dateFrom: '', dateTo: ''}));
                    }}
                    aria-label="Date range"
                >
                    {(Object.keys(RANGE_LABEL) as RangeOption[]).map((option) => (
                        <option key={option} value={option}>
                            {option === 'custom' && range === 'custom'
                                ? `${advanced.dateFrom || '…'} – ${advanced.dateTo || '…'}`
                                : RANGE_LABEL[option]}
                        </option>
                    ))}
                </select>
                <button type="button" className="ui-btn is-small" onClick={openFilters}>
                    More filters{advancedCount > 0 && <span className="ui-count-badge">{advancedCount}</span>}
                </button>
                {advancedCount > 0 && (
                    <button type="button" className="ui-link-btn is-muted" onClick={clearFilters}>Clear</button>
                )}
                {!loading && (
                    <span className="ui-filter-note">
                        {visible.length} of {totalLabel}
                    </span>
                )}
            </div>

            <div className="log-body">
                {loading ? (
                    <TableSkeleton columns="120px 90px 190px 1fr" rows={8}/>
                ) : actions.length === 0 ? (
                    <EmptyState title="Nothing in this window">
                        No admin actions match these filters. Automatic bank matches live in Bank payments.
                    </EmptyState>
                ) : (
                    <>
                        <div className="ui-table-wrap">
                            <table className="ui-table log-table">
                                <thead>
                                <tr>
                                    <th className="log-col-time">Time</th>
                                    <th className="log-col-admin">Admin</th>
                                    <th className="log-col-action">Action</th>
                                    <th>Summary</th>
                                </tr>
                                </thead>
                                <tbody>
                                {visible.map((action) => {
                                    const meta = metaFor(action.type);
                                    return (
                                        <tr
                                            key={action.id}
                                            className={`is-clickable ${selected?.id === action.id ? 'is-selected' : ''}`}
                                            onClick={() => setSelected(action)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') setSelected(action);
                                            }}
                                            tabIndex={0}
                                        >
                                            <td className="log-time">{formatLogTime(action.createdAt)}</td>
                                            <td className="log-admin" title={adminFull(action.createdByAccountId)}>
                                                {adminName(action.createdByAccountId)}
                                            </td>
                                            <td><Tag tone={meta.tone}>{meta.tag}</Tag></td>
                                            <td className="log-summary">{action.summary}</td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                        <div className="ui-table-footer log-footer">
                            <span>
                                Showing {visible.length} of {totalLabel}
                                {capped && <span className="ui-faint"> · newest {FETCH_LIMIT}; narrow the filters for older</span>}
                            </span>
                            <span className="log-pager">
                                <button
                                    type="button"
                                    className="ui-link-btn"
                                    onClick={() => setPage((p) => p - 1)}
                                    disabled={page === 0}
                                >
                                    ← Prev
                                </button>
                                <span aria-hidden="true">·</span>
                                <span>Page {page + 1} of {pageCount}</span>
                                <span aria-hidden="true">·</span>
                                <button
                                    type="button"
                                    className="ui-link-btn"
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={page + 1 >= pageCount}
                                >
                                    Next →
                                </button>
                            </span>
                        </div>
                    </>
                )}
            </div>

            <Drawer
                open={filtersOpen}
                title="Filter activity"
                onClose={() => setFiltersOpen(false)}
                footer={(
                    <>
                        <button type="button" className="ui-btn" onClick={clearFilters}>Clear all</button>
                        <button type="button" className="ui-btn is-primary" onClick={applyFilters}>Apply</button>
                    </>
                )}
            >
                <Field label="Admin" optional htmlFor="log-admin">
                    <select
                        id="log-admin"
                        className="ui-select"
                        value={draft.createdByAccountId}
                        onChange={(event) => updateDraft('createdByAccountId', event.target.value)}
                    >
                        <option value="">Any admin</option>
                        {sortedAccounts.map((account) => (
                            <option key={account.id} value={account.id}>{adminFull(account.id)}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Subscriber" optional htmlFor="log-subscriber">
                    <select
                        id="log-subscriber"
                        className="ui-select"
                        value={draft.subscriberId}
                        onChange={(event) => updateDraft('subscriberId', event.target.value)}
                    >
                        <option value="">Any subscriber</option>
                        {sortedSubscribers.map((subscriber) => (
                            <option key={subscriber.id} value={subscriber.id}>{fullName(subscriber)}</option>
                        ))}
                    </select>
                </Field>
                <Field label="What it touched" optional htmlFor="log-target-type">
                    <select
                        id="log-target-type"
                        className="ui-select"
                        value={draft.targetType}
                        onChange={(event) => updateDraft('targetType', event.target.value as AdminActionTargetType | '')}
                    >
                        <option value="">Anything</option>
                        {(Object.keys(TARGET_LABEL) as AdminActionTargetType[]).map((target) => (
                            <option key={target} value={target}>{TARGET_LABEL[target]}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Target id" optional error={draftError} hint="The id of one invoice, charge, run…" htmlFor="log-target-id">
                    <input
                        id="log-target-id"
                        className="ui-input log-mono-input"
                        value={draft.targetId}
                        onChange={(event) => updateDraft('targetId', event.target.value)}
                        placeholder="00000000-0000-0000-0000-000000000000"
                    />
                </Field>
                <div className="log-field-pair">
                    <Field label="From day" optional htmlFor="log-date-from">
                        <input
                            id="log-date-from"
                            type="date"
                            className="ui-input"
                            value={draft.dateFrom}
                            onChange={(event) => updateDraft('dateFrom', event.target.value)}
                        />
                    </Field>
                    <Field label="To day" optional htmlFor="log-date-to">
                        <input
                            id="log-date-to"
                            type="date"
                            className="ui-input"
                            value={draft.dateTo}
                            onChange={(event) => updateDraft('dateTo', event.target.value)}
                        />
                    </Field>
                </div>
                <div className="log-field-pair">
                    <Field label="Billing from" optional hint="Runs and invoices by period" htmlFor="log-from-month">
                        <input
                            id="log-from-month"
                            type="month"
                            className="ui-input"
                            value={draft.fromMonth}
                            onChange={(event) => updateDraft('fromMonth', event.target.value)}
                        />
                    </Field>
                    <Field label="Billing to" optional htmlFor="log-to-month">
                        <input
                            id="log-to-month"
                            type="month"
                            className="ui-input"
                            value={draft.toMonth}
                            onChange={(event) => updateDraft('toMonth', event.target.value)}
                        />
                    </Field>
                </div>
            </Drawer>

            <Drawer
                open={Boolean(selected)}
                eyebrow={selected ? formatLogTime(selected.createdAt) : undefined}
                title={selected ? metaFor(selected.type).label : ''}
                onClose={() => setSelected(null)}
                flush
            >
                {selected && (
                    <>
                        <DrawerSection>
                            <p className="log-detail-summary">{selected.summary}</p>
                        </DrawerSection>
                        <DrawerSection title="Details">
                            <dl className="log-detail-list">
                                <dt>When</dt>
                                <dd>{formatInstantDate(selected.createdAt)} {formatTime(selected.createdAt)}</dd>
                                <dt>Admin</dt>
                                <dd>{adminFull(selected.createdByAccountId)}</dd>
                                <dt>Touched</dt>
                                <dd>{TARGET_LABEL[selected.targetType] ?? humanize(selected.targetType)}</dd>
                                {selected.fromMonth && selected.toMonth && (
                                    <>
                                        <dt>Period</dt>
                                        <dd>{formatPeriod(selected.fromMonth, selected.toMonth)}</dd>
                                    </>
                                )}
                                {selected.subscriberId && (
                                    <>
                                        <dt>Subscriber</dt>
                                        <dd>{subscriberName[selected.subscriberId] ?? <span className="log-id">{selected.subscriberId}</span>}</dd>
                                    </>
                                )}
                                {selected.targetId && (
                                    <>
                                        <dt>Target id</dt>
                                        <dd className="log-id">{selected.targetId}</dd>
                                    </>
                                )}
                                <dt>Action id</dt>
                                <dd className="log-id">{selected.id}</dd>
                            </dl>
                        </DrawerSection>
                        {Object.keys(selected.metrics ?? {}).length > 0 && (
                            <DrawerSection title="Recorded data">
                                <dl className="log-detail-list">
                                    {Object.entries(selected.metrics).map(([key, value]) => (
                                        <div key={key} className="log-detail-row">
                                            <dt>{humanize(key)}</dt>
                                            <dd>
                                                {key.endsWith('AccountId') && typeof value === 'string'
                                                    ? adminFull(value)
                                                    : key.endsWith('At') && typeof value === 'string'
                                                        ? `${formatInstantDate(value)} ${formatTime(value)}`
                                                        : formatMetric(value)}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </DrawerSection>
                        )}
                        <DrawerSection>
                            <button
                                type="button"
                                className="ui-link-btn"
                                onClick={() => {
                                    setAdvanced({...EMPTY_ADVANCED, targetId: selected.targetId ?? ''});
                                    setActionType('');
                                    setRange('all');
                                    setSelected(null);
                                }}
                                disabled={!selected.targetId}
                            >
                                Show everything about this {(TARGET_LABEL[selected.targetType] ?? 'item').toLowerCase()}
                            </button>
                            <span className="ui-faint log-detail-note">
                                {plural(actions.filter((a) => a.targetId && a.targetId === selected.targetId).length, 'entry', 'entries')} in the current list
                            </span>
                        </DrawerSection>
                    </>
                )}
            </Drawer>
        </div>
    );
}
