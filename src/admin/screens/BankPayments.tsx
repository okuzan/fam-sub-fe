import {useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {getResponseErrorMessage} from '../../utils/errors';
import {useToast} from '../../components/ToastContext';
import {useConfirm} from '../../ui/confirmContext';
import {useAdminNav} from '../adminNavContext';
import {EmptyState, PageHeader, TableSkeleton, Tabs, Tag, type Tone} from '../../ui/components';
import {formatInstantDate, formatMoney, formatTime, formatWhen, plural} from '../../ui/format';
import type {SubscriberResponse} from '../../types/subscriber';
import type {
    BankMatchMethod,
    BankPaymentResolution,
    BankPaymentsOverview,
    BankSenderResponse,
    BankSyncResult,
    BankSyncStatus,
    BankTransactionResponse,
    BankTransactionStatus
} from '../../types/bankPayment';
import './BankPayments.css';
import SubscriberOptions from './SubscriberOptions';
import {primeSubscriberNames, useSubscriberNames} from '../subscriberNames';

type TabKey = BankTransactionStatus | 'ALL';

/** The backend caps a page at 500; counts and filters are computed from this one read. */
const FETCH_LIMIT = 500;
const RECENT_APPLIED = 5;

const MATCH_TAGS: Record<BankMatchMethod, { label: string; tone: Tone }> = {
    PAYMENT_CODE: {label: 'Payment code', tone: 'green'},
    NAME: {label: 'Name match', tone: 'green'},
    SENDER_RULE: {label: 'Known sender', tone: 'slate'},
    ADMIN: {label: 'Admin', tone: 'grey'}
};

interface AssignDraft {
    subscriberId: string;
    rememberSender: boolean;
}

const purposeOf = (transaction: BankTransactionResponse) =>
    [transaction.description, transaction.comment].filter(Boolean).join(' · ');

const settledText = (transaction: BankTransactionResponse) =>
    transaction.settledInvoiceCount > 0
        ? `${plural(transaction.settledInvoiceCount, 'invoice')} settled`
        : 'to balance';

export default function BankPayments() {
    const names = useSubscriberNames();
    const {showError, showSuccess} = useToast();
    const confirm = useConfirm();
    const {refreshCounts} = useAdminNav();
    const [tab, setTab] = useState<TabKey>('UNMATCHED');
    const [overview, setOverview] = useState<BankPaymentsOverview | null>(null);
    const [senders, setSenders] = useState<BankSenderResponse[]>([]);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [drafts, setDrafts] = useState<Record<string, AssignDraft>>({});
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [overviewResponse, sendersResponse] = await Promise.all([
                apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}?limit=${FETCH_LIMIT}`),
                apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/senders`)
            ]);
            if (overviewResponse.ok) {
                setOverview(await overviewResponse.json());
            } else {
                showError(await getResponseErrorMessage(overviewResponse, 'Could not load bank payments'));
            }
            if (sendersResponse.ok) setSenders(await sendersResponse.json());
        } catch (err) {
            console.error(err);
            showError('Could not load bank payments');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        apiFetch(API_CONFIG.SUBSCRIBERS_URL)
            .then((response) => response.ok ? response.json() : [])
            .then((list: SubscriberResponse[]) => {
                setSubscribers([...list].sort((a, b) => a.name.localeCompare(b.name)));
                primeSubscriberNames(list);
            })
            .catch((err) => console.error(err));
    }, []);

    const afterChange = async () => {
        await load();
        refreshCounts();
    };

    const transactions = useMemo(() => overview?.transactions ?? [], [overview]);
    const byStatus = useMemo(() => ({
        UNMATCHED: transactions.filter((t) => t.status === 'UNMATCHED'),
        APPLIED: transactions.filter((t) => t.status === 'APPLIED'),
        IGNORED: transactions.filter((t) => t.status === 'IGNORED')
    }), [transactions]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/sync`, {method: 'POST'});
            if (response.ok) {
                const result: BankSyncResult = await response.json();
                if (result.importedCount === 0) {
                    showSuccess('No new transfers', `Read up to ${formatTime(result.syncedTo)}`);
                } else {
                    showSuccess(
                        plural(result.importedCount, 'new transfer'),
                        `${result.appliedCount} applied · ${result.needsReviewCount} to review · ${result.ignoredCount} ignored`
                    );
                }
                await afterChange();
            } else {
                // A 429 carries Monobank's rate-limit message; show it as is.
                showError(await getResponseErrorMessage(response, 'Bank sync failed'));
            }
        } catch (err) {
            console.error(err);
            showError('Bank sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const draftFor = (transaction: BankTransactionResponse): AssignDraft =>
        drafts[transaction.id] ?? {
            subscriberId: transaction.suggestions[0]?.subscriberId ?? '',
            rememberSender: transaction.senderName !== null
        };

    const updateDraft = (transaction: BankTransactionResponse, change: Partial<AssignDraft>) =>
        setDrafts((current) => ({...current, [transaction.id]: {...draftFor(transaction), ...change}}));

    const handleAssign = async (transaction: BankTransactionResponse) => {
        const draft = draftFor(transaction);
        if (!draft.subscriberId) {
            showError('Choose whose payment this is');
            return;
        }
        setBusyId(transaction.id);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/${transaction.id}/assign`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    subscriberId: draft.subscriberId,
                    rememberSender: transaction.senderName !== null && draft.rememberSender
                })
            });
            if (response.ok) {
                const result: BankPaymentResolution = await response.json();
                const detail = [
                    result.settledInvoiceIds.length > 0
                        ? `${plural(result.settledInvoiceIds.length, 'invoice')} settled`
                        : 'No invoice settled',
                    result.balanceAfter !== null ? `balance ${formatMoney(result.balanceAfter)}` : null,
                    result.senderRemembered ? 'sender remembered' : null
                ].filter(Boolean).join(' · ');
                showSuccess(
                    `Applied ${formatMoney(transaction.amount)} to ${result.transaction.subscriberName ?? 'subscriber'}`,
                    detail
                );
                setDrafts((current) => {
                    const next = {...current};
                    delete next[transaction.id];
                    return next;
                });
                await afterChange();
            } else {
                showError(await getResponseErrorMessage(response, 'Could not apply the payment'));
            }
        } catch (err) {
            console.error(err);
            showError('Could not apply the payment');
        } finally {
            setBusyId(null);
        }
    };

    const handleIgnore = async (transaction: BankTransactionResponse, ignoreSender: boolean) => {
        const who = transaction.senderName ?? 'this sender';
        if (ignoreSender) {
            const {confirmed} = await confirm({
                title: `Always ignore ${who}?`,
                text: 'This transfer and every later one from this sender will be filed as ignored without review. ' +
                    'You can undo it under Known senders.',
                confirmLabel: 'Always ignore',
                tone: 'dark'
            });
            if (!confirmed) return;
        }
        setBusyId(transaction.id);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/${transaction.id}/ignore`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ignoreSender})
            });
            if (response.ok) {
                showSuccess(
                    ignoreSender ? `Ignoring transfers from ${who}` : 'Transfer ignored',
                    `${formatMoney(transaction.amount)} · ${formatWhen(transaction.occurredAt)}`
                );
                await afterChange();
            } else {
                showError(await getResponseErrorMessage(response, 'Could not ignore the transfer'));
            }
        } catch (err) {
            console.error(err);
            showError('Could not ignore the transfer');
        } finally {
            setBusyId(null);
        }
    };

    const handleForget = async (sender: BankSenderResponse) => {
        const name = sender.senderName ?? 'this sender';
        const {confirmed} = await confirm({
            title: `Forget ${name}?`,
            text: 'Their next transfer will wait here for review again. Transfers already applied stay as they are.',
            confirmLabel: 'Forget sender',
            tone: 'danger'
        });
        if (!confirmed) return;
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/senders/${sender.id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showSuccess('Sender forgotten', name);
                await afterChange();
            } else {
                showError(await getResponseErrorMessage(response, 'Could not forget the sender'));
            }
        } catch (err) {
            console.error(err);
            showError('Could not forget the sender');
        }
    };

    const sync = overview?.sync ?? null;

    const tabs = [
        {value: 'UNMATCHED' as const, label: 'Needs review', count: byStatus.UNMATCHED.length},
        {value: 'APPLIED' as const, label: 'Applied', count: byStatus.APPLIED.length},
        {value: 'IGNORED' as const, label: 'Ignored', count: byStatus.IGNORED.length},
        {value: 'ALL' as const, label: 'All', count: transactions.length}
    ];

    const renderCards = (list: BankTransactionResponse[]) => (
        <div className="bank-cards">
            {list.map((transaction) => (
                <ReviewCard
                    key={transaction.id}
                    transaction={transaction}
                    draft={draftFor(transaction)}
                    subscribers={subscribers}
                    busy={busyId === transaction.id}
                    onDraft={(change) => updateDraft(transaction, change)}
                    onAssign={() => handleAssign(transaction)}
                    onIgnore={(ignoreSender) => handleIgnore(transaction, ignoreSender)}
                />
            ))}
        </div>
    );

    const renderTabBody = () => {
        if (loading) {
            return <TableSkeleton columns="110px 1fr 1fr 110px 1fr 100px" rows={5}/>;
        }
        if (tab === 'UNMATCHED') {
            return (
                <>
                    {byStatus.UNMATCHED.length === 0 ? (
                        <EmptyState title="No transfers need review">
                            Payments with a payment code or from a known sender are applied as they arrive.
                            {sync?.syncedTo && ` Last read ${formatTime(sync.syncedTo)}.`}
                        </EmptyState>
                    ) : renderCards(byStatus.UNMATCHED)}
                    {byStatus.APPLIED.length > 0 && (
                        <section className="bank-section">
                            <div className="bank-section-head">
                                <h2 className="ui-section-title">Recently applied</h2>
                                <button type="button" className="ui-link-btn is-green bank-section-link"
                                        onClick={() => setTab('APPLIED')}>
                                    All {byStatus.APPLIED.length} applied →
                                </button>
                            </div>
                            <TransactionTable list={byStatus.APPLIED.slice(0, RECENT_APPLIED)}/>
                        </section>
                    )}
                </>
            );
        }
        if (tab === 'IGNORED') {
            return byStatus.IGNORED.length === 0
                ? <EmptyState title="Nothing ignored">Transfers you mark as not FamSub money show up here.</EmptyState>
                : (
                    <>
                        <p className="bank-hint">Ignored by mistake? Choose the subscriber and apply it.</p>
                        {renderCards(byStatus.IGNORED)}
                    </>
                );
        }
        const list = tab === 'APPLIED' ? byStatus.APPLIED : transactions;
        if (list.length === 0) {
            return <EmptyState title="No transfers yet">Incoming transfers appear here after the next read.</EmptyState>;
        }
        return (
            <section className="bank-section">
                <TransactionTable list={list} onOpenTab={setTab}/>
                {transactions.length >= FETCH_LIMIT && (
                    <p className="bank-hint">Showing the latest {FETCH_LIMIT} transfers.</p>
                )}
            </section>
        );
    };

    return (
        <div className="bank-page">
            <PageHeader
                eyebrow="Billing"
                title="Bank payments"
                lead="Incoming transfers to the Monobank account. A transfer matched by payment code or a known sender goes to that subscriber’s balance and settles their invoices: the exact-amount one first, then oldest first."
            />

            <SyncStrip sync={sync} syncing={syncing} onSync={handleSync}/>

            <div className="bank-tabs">
                <Tabs options={tabs} value={tab} onChange={setTab} alertValue="UNMATCHED"/>
            </div>

            <div className="bank-body">
                {renderTabBody()}

                <section className="bank-section">
                    <div className="bank-section-head">
                        <h2 className="ui-section-title">Known senders</h2>
                        <span className="bank-section-note">Transfers from these names are handled without review</span>
                    </div>
                    {senders.length === 0 ? (
                        <p className="bank-hint">
                            No senders remembered yet. Applying a transfer with “Apply this sender’s next payments
                            automatically” adds one.
                        </p>
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table bank-senders-table">
                                <thead>
                                <tr>
                                    <th>Sender</th>
                                    <th>Pays for</th>
                                    <th>Learned</th>
                                    <th aria-label="Actions"/>
                                </tr>
                                </thead>
                                <tbody>
                                {senders.map((sender) => (
                                    <tr key={sender.id}>
                                        <td className="bank-strong">{sender.senderName ?? '—'}</td>
                                        <td>
                                            {sender.ignored || !sender.subscriberName
                                                ? <span className="ui-faint">Ignored</span>
                                                : <span className="is-strong">{names.short(sender.subscriberId, sender.subscriberName)}</span>}
                                        </td>
                                        <td className="ui-muted">
                                            {sender.learnedAutomatically ? 'From payment code' : 'By an admin'}
                                            {' · '}{formatInstantDate(sender.createdAt)}
                                        </td>
                                        <td className="is-actions">
                                            <button type="button" className="ui-link-btn is-muted bank-forget"
                                                    onClick={() => handleForget(sender)}>
                                                Forget
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function SyncStrip({sync, syncing, onSync}: {
    sync: BankSyncStatus | null;
    syncing: boolean;
    onSync: () => void;
}) {
    if (!sync) {
        return <div className="bank-sync"><span className="bank-sync-text">Reading sync status…</span></div>;
    }
    const button = (
        <button type="button" className="ui-btn is-small bank-sync-btn" onClick={onSync}
                disabled={syncing || !sync.configured}>
            {syncing ? 'Syncing…' : 'Sync now'}
        </button>
    );
    if (!sync.configured) {
        return (
            <div className="bank-sync is-off">
                <span className="ui-dot tone-grey" aria-hidden="true"/>
                <span className="bank-sync-title">Monobank isn’t connected</span>
                <span className="bank-sync-text">Set MONO_API_TOKEN on the server to read the statement.</span>
                {button}
            </div>
        );
    }
    if (sync.lastError) {
        return (
            <div className="bank-sync is-error" role="status">
                <span className="ui-dot tone-red" aria-hidden="true"/>
                <span className="bank-sync-title">Can’t read the statement</span>
                <span className="bank-sync-text">
                    {sync.lastError}
                    {sync.lastSuccessAt && ` · last good read ${formatWhen(sync.lastSuccessAt)}`}
                    {sync.syncEnabled ? ' · retrying every 5 min' : ' · automatic sync is off here'}
                </span>
                {button}
            </div>
        );
    }
    return (
        <div className="bank-sync">
            <span className="ui-dot tone-green" aria-hidden="true"/>
            <span className="bank-sync-title">
                {sync.syncedTo ? `Read up to ${formatTime(sync.syncedTo)}` : 'Not read yet'}
            </span>
            <span className="bank-sync-text">
                · {sync.syncEnabled ? 'auto every 5 min' : 'automatic sync is off here'}
            </span>
            {button}
        </div>
    );
}

interface ReviewCardProps {
    transaction: BankTransactionResponse;
    draft: AssignDraft;
    subscribers: SubscriberResponse[];
    busy: boolean;
    onDraft: (change: Partial<AssignDraft>) => void;
    onAssign: () => void;
    onIgnore: (ignoreSender: boolean) => void;
}

function ReviewCard({transaction, draft, subscribers, busy, onDraft, onAssign, onIgnore}: ReviewCardProps) {
    const names = useSubscriberNames();
    const purpose = purposeOf(transaction);
    const unmatched = transaction.status === 'UNMATCHED';
    return (
        <article className={`bank-card ${unmatched ? '' : 'is-ignored'}`}>
            <div className="bank-card-top">
                <span className="bank-card-amount">{formatMoney(transaction.amount)}</span>
                <div className="bank-card-who">
                    <span className="bank-card-sender">{transaction.senderName ?? 'Unknown sender'}</span>
                    {purpose && <span className="bank-card-purpose">“{purpose}”</span>}
                    {transaction.counterIban && <span className="bank-card-iban">{transaction.counterIban}</span>}
                </div>
                <span className="bank-card-when">{formatWhen(transaction.occurredAt)}</span>
            </div>

            {transaction.reviewNote && <p className="bank-card-row bank-card-note">{transaction.reviewNote}</p>}

            {transaction.suggestions.length > 0 ? (
                <div className="bank-card-row bank-chips">
                    <span className="ui-label bank-chips-label">Suggested</span>
                    {transaction.suggestions.map((suggestion) => (
                        <button
                            key={suggestion.subscriberId}
                            type="button"
                            className={`bank-chip ${draft.subscriberId === suggestion.subscriberId ? 'is-selected' : ''}`}
                            aria-pressed={draft.subscriberId === suggestion.subscriberId}
                            onClick={() => onDraft({subscriberId: suggestion.subscriberId})}
                            disabled={busy}
                        >
                            <span className="bank-chip-name">{names.short(suggestion.subscriberId, suggestion.subscriberName)}</span>
                            <span className="bank-chip-reason">{suggestion.reason}</span>
                        </button>
                    ))}
                </div>
            ) : unmatched && (
                <p className="bank-card-row bank-card-note">
                    No suggestions: no payment code, unknown sender, no unpaid invoice of this amount.
                </p>
            )}

            <div className="bank-card-row bank-card-actions">
                <select
                    aria-label="Whose payment"
                    className={`ui-select bank-select ${draft.subscriberId ? '' : 'is-empty'}`}
                    value={draft.subscriberId}
                    onChange={(event) => onDraft({subscriberId: event.target.value})}
                    disabled={busy}
                >
                    <option value="">Choose subscriber</option>
                    <SubscriberOptions subscribers={subscribers}/>
                </select>
                <button type="button" className="ui-btn is-primary bank-apply" onClick={onAssign}
                        disabled={busy || !draft.subscriberId}>
                    {busy ? 'Applying…' : 'Apply'}
                </button>
                {transaction.senderName && (
                    <label className="ui-checkbox bank-remember">
                        <input
                            type="checkbox"
                            checked={draft.rememberSender}
                            onChange={(event) => onDraft({rememberSender: event.target.checked})}
                            disabled={busy}
                        />
                        Apply this sender’s next payments automatically
                    </label>
                )}
                {unmatched && (
                    <div className="bank-card-links">
                        <button type="button" className="ui-link-btn is-muted" onClick={() => onIgnore(false)}
                                disabled={busy}>
                            Not FamSub money
                        </button>
                        {transaction.senderName && (
                            <button type="button" className="ui-link-btn is-muted" onClick={() => onIgnore(true)}
                                    disabled={busy}>
                                Always ignore this sender
                            </button>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}

function TransactionTable({list, onOpenTab}: {
    list: BankTransactionResponse[];
    onOpenTab?: (tab: TabKey) => void;
}) {
    const names = useSubscriberNames();
    return (
        <div className="ui-table-wrap">
            <table className="ui-table bank-table">
                <thead>
                <tr>
                    <th>Time</th>
                    <th>Sender</th>
                    <th>Purpose</th>
                    <th className="is-num">Amount</th>
                    <th>Went to</th>
                    <th className="bank-col-end">Matched by</th>
                </tr>
                </thead>
                <tbody>
                {list.map((transaction) => {
                    const purpose = purposeOf(transaction);
                    // Unresolved rows in the All list open the tab where they can be resolved.
                    const open = transaction.status !== 'APPLIED' && onOpenTab
                        ? () => onOpenTab(transaction.status)
                        : undefined;
                    return (
                        <tr key={transaction.id} className={open ? 'is-clickable' : ''} onClick={open}>
                            <td className="bank-mono-cell">{formatWhen(transaction.occurredAt)}</td>
                            <td className="bank-strong">{transaction.senderName ?? 'Unknown sender'}</td>
                            <td className="bank-purpose-cell" title={purpose}>{purpose || '—'}</td>
                            <td className="is-num">{formatMoney(transaction.amount)}</td>
                            <td>
                                {transaction.status === 'APPLIED' ? (
                                    <>
                                        <strong className="is-strong">{transaction.subscriberName ? names.short(transaction.subscriberId, transaction.subscriberName) : '—'}</strong>
                                        {' · '}{settledText(transaction)}
                                    </>
                                ) : <span className="ui-faint">—</span>}
                            </td>
                            <td className="bank-col-end">
                                {transaction.status === 'UNMATCHED' && <Tag tone="red">Needs review</Tag>}
                                {transaction.status === 'IGNORED' && <Tag tone="grey">Ignored</Tag>}
                                {transaction.status === 'APPLIED' && transaction.matchMethod && (
                                    <Tag tone={MATCH_TAGS[transaction.matchMethod].tone}>
                                        {MATCH_TAGS[transaction.matchMethod].label}
                                    </Tag>
                                )}
                            </td>
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
}
