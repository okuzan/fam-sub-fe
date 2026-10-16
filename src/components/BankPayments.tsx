import {useCallback, useEffect, useState} from 'react';
import {API_CONFIG, apiFetch} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {useToast} from './ToastContext';
import type {SubscriberResponse} from '../types/subscriber';
import type {
    BankPaymentResolution,
    BankPaymentsOverview,
    BankSenderResponse,
    BankSyncResult,
    BankTransactionResponse,
    BankTransactionStatus
} from '../types/bankPayment';
import './BankPayments.css';

type StatusFilter = BankTransactionStatus | 'ALL';

const FILTERS: { key: StatusFilter; label: string }[] = [
    {key: 'UNMATCHED', label: 'Needs review'},
    {key: 'APPLIED', label: 'Applied'},
    {key: 'IGNORED', label: 'Ignored'},
    {key: 'ALL', label: 'All'}
];

const MATCH_LABELS: Record<string, string> = {
    PAYMENT_CODE: 'payment code',
    SENDER_RULE: 'known sender',
    ADMIN: 'assigned by admin'
};

const formatMoney = (value: number | null | undefined) =>
    `₴${Number(value ?? 0).toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

const formatTimestamp = (value: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
};

interface AssignDraft {
    subscriberId: string;
    rememberSender: boolean;
}

export default function BankPayments() {
    const {showError, showSuccess} = useToast();
    const [filter, setFilter] = useState<StatusFilter>('UNMATCHED');
    const [overview, setOverview] = useState<BankPaymentsOverview | null>(null);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [senders, setSenders] = useState<BankSenderResponse[]>([]);
    const [drafts, setDrafts] = useState<Record<string, AssignDraft>>({});
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const fetchOverview = useCallback(async (status: StatusFilter) => {
        try {
            const query = status === 'ALL' ? '' : `?status=${status}`;
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}${query}`);
            if (response.ok) {
                setOverview(await response.json());
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to load bank payments'));
            }
        } catch (err) {
            console.error(err);
            showError('Error loading bank payments');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    const fetchSenders = useCallback(async () => {
        const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/senders`);
        if (response.ok) setSenders(await response.json());
    }, []);

    useEffect(() => {
        fetchOverview(filter);
    }, [fetchOverview, filter]);

    useEffect(() => {
        fetchSenders();
        apiFetch(API_CONFIG.SUBSCRIBERS_URL)
            .then((response) => response.ok ? response.json() : [])
            .then(setSubscribers)
            .catch((err) => console.error(err));
    }, [fetchSenders]);

    const refresh = async () => {
        await Promise.all([fetchOverview(filter), fetchSenders()]);
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/sync`, {method: 'POST'});
            if (response.ok) {
                const result: BankSyncResult = await response.json();
                showSuccess(result.importedCount === 0
                    ? 'No new payments'
                    : `${result.importedCount} new: ${result.appliedCount} applied, ${result.needsReviewCount} to review`);
                await refresh();
            } else {
                showError(await getResponseErrorMessage(response, 'Bank sync failed'));
            }
        } catch (err) {
            console.error(err);
            showError('Error syncing bank payments');
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
                body: JSON.stringify(draft)
            });
            if (response.ok) {
                const result: BankPaymentResolution = await response.json();
                showSuccess(
                    `Applied ${formatMoney(transaction.amount)} to ${result.transaction.subscriberName}: ` +
                    `${result.settledInvoiceIds.length} invoice(s) paid, balance ${formatMoney(result.balanceAfter)}`
                );
                await refresh();
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to apply payment'));
            }
        } catch (err) {
            console.error(err);
            showError('Error applying payment');
        } finally {
            setBusyId(null);
        }
    };

    const handleIgnore = async (transaction: BankTransactionResponse, ignoreSender: boolean) => {
        const who = transaction.senderName ?? 'this sender';
        if (ignoreSender && !confirm(`Ignore every payment from ${who} from now on?`)) return;
        setBusyId(transaction.id);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/${transaction.id}/ignore`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ignoreSender})
            });
            if (response.ok) {
                showSuccess(ignoreSender ? `Ignoring payments from ${who}` : 'Payment ignored');
                await refresh();
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to ignore payment'));
            }
        } catch (err) {
            console.error(err);
            showError('Error ignoring payment');
        } finally {
            setBusyId(null);
        }
    };

    const handleForgetSender = async (sender: BankSenderResponse) => {
        if (!confirm(`Forget ${sender.senderName ?? 'this sender'}? Their next payment will need review again.`)) return;
        const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/senders/${sender.id}`, {method: 'DELETE'});
        if (response.ok) {
            showSuccess('Sender forgotten');
            await fetchSenders();
        } else {
            showError(await getResponseErrorMessage(response, 'Failed to forget sender'));
        }
    };

    const sync = overview?.sync;
    const transactions = overview?.transactions ?? [];

    const renderResolution = (transaction: BankTransactionResponse) => {
        if (transaction.status === 'APPLIED') {
            return (
                <div className="bank-resolution">
                    <strong>{transaction.subscriberName}</strong>
                    <span>
                        {transaction.settledInvoiceCount} invoice(s), {formatMoney(transaction.settledAmount)}
                        {transaction.matchMethod && ` · ${MATCH_LABELS[transaction.matchMethod]}`}
                    </span>
                </div>
            );
        }

        const draft = draftFor(transaction);
        const busy = busyId === transaction.id;
        return (
            <div className="bank-assign">
                {transaction.reviewNote && <p className="bank-review-note">{transaction.reviewNote}</p>}
                {transaction.suggestions.length > 0 && (
                    <div className="bank-suggestions">
                        {transaction.suggestions.map((suggestion) => (
                            <button
                                key={suggestion.subscriberId}
                                type="button"
                                className={draft.subscriberId === suggestion.subscriberId ? 'is-selected' : ''}
                                onClick={() => updateDraft(transaction, {subscriberId: suggestion.subscriberId})}
                                title={suggestion.reason}
                            >
                                {suggestion.subscriberName}
                                <small>{suggestion.reason}</small>
                            </button>
                        ))}
                    </div>
                )}
                <div className="bank-assign-row">
                    <select
                        value={draft.subscriberId}
                        onChange={(event) => updateDraft(transaction, {subscriberId: event.target.value})}
                        disabled={busy}
                    >
                        <option value="">Whose payment?</option>
                        {subscribers.map((subscriber) => (
                            <option key={subscriber.id} value={subscriber.id}>{subscriber.name}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="bank-apply-btn"
                        onClick={() => handleAssign(transaction)}
                        disabled={busy || !draft.subscriberId}
                    >
                        {busy ? 'Applying...' : 'Apply'}
                    </button>
                </div>
                {transaction.senderName && (
                    <label className="bank-remember">
                        <input
                            type="checkbox"
                            checked={draft.rememberSender}
                            onChange={(event) => updateDraft(transaction, {rememberSender: event.target.checked})}
                            disabled={busy}
                        />
                        Apply {transaction.senderName}'s next payments automatically
                    </label>
                )}
                {transaction.status === 'UNMATCHED' && (
                    <div className="bank-ignore-row">
                        <button type="button" onClick={() => handleIgnore(transaction, false)} disabled={busy}>
                            Not FamSub money
                        </button>
                        {transaction.senderName && (
                            <button type="button" onClick={() => handleIgnore(transaction, true)} disabled={busy}>
                                Always ignore this sender
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bank-payments">
            <div className="bank-payments-header">
                <div>
                    <h2>Bank Payments</h2>
                    <p>Incoming Monobank transfers. Payments with a FamSub code or from a known sender are applied
                        automatically; the rest wait here.</p>
                </div>
                <button type="button" className="bank-sync-btn" onClick={handleSync} disabled={syncing || !sync?.configured}>
                    {syncing ? 'Syncing...' : 'Sync now'}
                </button>
            </div>

            {sync && (
                <div className={`bank-sync-status ${sync.lastError ? 'has-error' : ''}`}>
                    {!sync.configured ? (
                        <span>Monobank is not configured: MONO_API_TOKEN is not set.</span>
                    ) : (
                        <>
                            <span>Read up to {formatTimestamp(sync.syncedTo)}</span>
                            <span>{sync.syncEnabled ? 'Automatic sync every 5 minutes' : 'Automatic sync is off here'}</span>
                            {sync.lastError && <span>Last attempt failed: {sync.lastError}</span>}
                        </>
                    )}
                </div>
            )}

            <div className="bank-filters" role="tablist">
                {FILTERS.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        className={filter === item.key ? 'is-active' : ''}
                        onClick={() => setFilter(item.key)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="bank-empty">Loading payments...</div>
            ) : transactions.length === 0 ? (
                <div className="bank-empty">
                    {filter === 'UNMATCHED' ? 'Nothing to review.' : 'No payments here yet.'}
                </div>
            ) : (
                <div className="bank-list">
                    {transactions.map((transaction) => (
                        <article key={transaction.id} className={`bank-item bank-item-${transaction.status.toLowerCase()}`}>
                            <div className="bank-item-main">
                                <strong className="bank-amount">{formatMoney(transaction.amount)}</strong>
                                <span className="bank-sender">{transaction.senderName ?? 'Unknown sender'}</span>
                                <span className="bank-time">{formatTimestamp(transaction.occurredAt)}</span>
                                {(transaction.comment || transaction.description) && (
                                    <span className="bank-text">
                                        {[transaction.description, transaction.comment].filter(Boolean).join(' · ')}
                                    </span>
                                )}
                                {transaction.status === 'IGNORED' && <span className="bank-text">Ignored</span>}
                            </div>
                            {transaction.status !== 'IGNORED' || filter === 'IGNORED'
                                ? renderResolution(transaction)
                                : null}
                        </article>
                    ))}
                </div>
            )}

            <section className="bank-senders">
                <h3>Known senders</h3>
                {senders.length === 0 ? (
                    <div className="bank-empty">No senders remembered yet.</div>
                ) : (
                    <table>
                        <thead>
                        <tr>
                            <th>Sender</th>
                            <th>Pays for</th>
                            <th>Learned</th>
                            <th/>
                        </tr>
                        </thead>
                        <tbody>
                        {senders.map((sender) => (
                            <tr key={sender.id}>
                                <td>{sender.senderName ?? '—'}</td>
                                <td>{sender.ignored ? <em>Ignored</em> : sender.subscriberName}</td>
                                <td>{sender.learnedAutomatically ? 'From a payment code' : 'By an admin'}</td>
                                <td>
                                    <button type="button" onClick={() => handleForgetSender(sender)}>Forget</button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}
