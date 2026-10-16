import {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {API_CONFIG} from '../../../config/api';
import {useToast} from '../../../components/ToastContext';
import {Drawer, DrawerSection, Money, Tag, TableSkeleton} from '../../../ui/components';
import {useConfirm} from '../../../ui/confirmContext';
import {daysSince, formatDate, formatInstantDate, formatMoney, formatMonth, formatTime, plural} from '../../../ui/format';
import type {BankTransactionResponse} from '../../../types/bankPayment';
import type {
    InvoiceDetailResponse,
    InvoiceResponse,
    InvoiceStatus,
    InvoiceStatusHistoryResponse
} from '../../../types/invoice';
import type {SubscriberResponse} from '../../../types/subscriber';
import {
    creationText,
    downloadInvoicePdf,
    getJson,
    historyText,
    invoiceName,
    invoiceUrl,
    isOpen,
    sendJson,
    shortId,
    statusTone
} from './invoiceUtils';

const MATCH_TEXT: Record<string, string> = {
    PAYMENT_CODE: 'matched by payment code',
    SENDER_RULE: 'matched by a known sender',
    ADMIN: 'assigned by an admin',
};

interface InvoiceDrawerProps {
    /** The row that was clicked; shown until the detail arrives. */
    invoice: InvoiceResponse;
    onClose: () => void;
    /** Something changed: refetch the list and the sidebar counts. */
    onChanged: () => void;
    onDuplicate: (invoice: InvoiceResponse) => void;
}

export default function InvoiceDrawer({invoice: summary, onClose, onChanged, onDuplicate}: InvoiceDrawerProps) {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();
    const [detail, setDetail] = useState<InvoiceDetailResponse | null>(null);
    const [history, setHistory] = useState<InvoiceStatusHistoryResponse[] | null>(null);
    const [balance, setBalance] = useState<number | null>(null);
    const [bankPayment, setBankPayment] = useState<BankTransactionResponse | null>(null);
    const [notes, setNotes] = useState(summary.notes ?? '');
    const [busy, setBusy] = useState<string | null>(null);

    const invoiceId = summary.id;

    const load = useCallback(async () => {
        const [detailResult, historyResult] = await Promise.all([
            getJson<InvoiceDetailResponse>(invoiceUrl(invoiceId), 'Could not load the invoice.'),
            getJson<InvoiceStatusHistoryResponse[]>(invoiceUrl(invoiceId, '/status-history'), 'Could not load the status history.'),
        ]);
        if ('error' in detailResult) {
            showError(detailResult.error);
            return;
        }
        const loaded = detailResult.data;
        setDetail(loaded);
        setNotes(loaded.invoice.notes ?? '');
        if ('error' in historyResult) {
            showError(historyResult.error);
            setHistory([]);
        } else {
            setHistory(Array.isArray(historyResult.data) ? historyResult.data : []);
        }

        const [subscriberResult, bankResult] = await Promise.all([
            getJson<SubscriberResponse>(`${API_CONFIG.SUBSCRIBERS_URL}/${loaded.invoice.subscriberId}`, 'Could not load the balance.'),
            loaded.invoice.paidByBankTransactionId
                ? getJson<BankTransactionResponse>(
                    `${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/${loaded.invoice.paidByBankTransactionId}`,
                    'Could not load the bank transfer.'
                )
                : Promise.resolve(null),
        ]);
        setBalance('data' in subscriberResult ? Number(subscriberResult.data.balance ?? 0) : null);
        setBankPayment(bankResult && 'data' in bankResult ? bankResult.data : null);
    }, [invoiceId, showError]);

    useEffect(() => {
        void load();
    }, [load]);

    const invoice = detail?.invoice ?? summary;
    const name = invoiceName(invoice);
    const open = isOpen(invoice);
    const balanceCovers = balance !== null && balance >= invoice.totalAmount;
    const canDelete = invoice.status === 'DRAFT' && invoice.origin === 'MANUAL';

    const afterChange = async (message: string, detailLine?: string) => {
        showSuccess(message, detailLine);
        onChanged();
        window.dispatchEvent(new CustomEvent('subscriber-refresh-needed'));
        await load();
    };

    const run = async (key: string, action: () => Promise<void>) => {
        setBusy(key);
        try {
            await action();
        } finally {
            setBusy(null);
        }
    };

    const handlePdf = () => run('pdf', async () => {
        const error = await downloadInvoicePdf(invoice);
        if (error) showError(`Couldn’t download the PDF for ${name}`, error);
    });

    const handleEmail = () => run('email', async () => {
        const result = await sendJson<{ message?: string }>(invoiceUrl(invoice.id, '/email'), 'POST', undefined,
            'The email could not be sent.');
        if ('error' in result) showError(`Couldn’t email ${invoice.subscriberName}`, result.error);
        else await afterChange(`Emailed ${invoice.subscriberName}`, result.data?.message);
    });

    const setStatus = (status: InvoiceStatus, label: string) => run(`status-${status}`, async () => {
        const result = await sendJson<InvoiceResponse>(invoiceUrl(invoice.id, '/status'), 'PATCH', {status},
            'The status could not be changed.');
        if ('error' in result) showError(`Couldn’t update ${name}`, result.error);
        else await afterChange(label, name);
    });

    const handleStatusChange = async (status: InvoiceStatus) => {
        if (invoice.status === 'PAID') {
            const {confirmed} = await confirm({
                title: `Reopen ${name}?`,
                text: `It goes back to ${status.toLowerCase()} and counts toward their debt again. If it was paid from balance, that amount returns to their balance.`,
                confirmLabel: 'Reopen invoice',
                tone: 'dark',
            });
            if (!confirmed) return;
        }
        await setStatus(status, status === 'PAID' ? 'Marked paid' : `Status set to ${status.toLowerCase()}`);
    };

    const handlePayFromBalance = async () => {
        const {confirmed} = await confirm({
            title: `Pay ${name} from balance?`,
            text: `${formatMoney(invoice.totalAmount)} comes off ${invoice.subscriberName}’s balance of ${formatMoney(balance)} and the invoice is marked paid.`,
            confirmLabel: 'Pay from balance',
            tone: 'primary',
        });
        if (!confirmed) return;
        await run('balance', async () => {
            const result = await sendJson<InvoiceResponse>(invoiceUrl(invoice.id, '/pay-from-balance'), 'POST',
                undefined, 'The invoice could not be paid from balance.');
            if ('error' in result) showError(`Couldn’t pay ${name}`, result.error);
            else await afterChange('Paid from balance', `${name} · ${formatMoney(invoice.totalAmount)}`);
        });
    };

    const handleVoid = async () => {
        const {confirmed, reason} = await confirm({
            title: `Void ${name}?`,
            text: `The ${formatMoney(invoice.totalAmount)} invoice stops counting toward their debt and its ledger lines can be invoiced again. It stays in the list as void with your reason.`,
            confirmLabel: 'Void invoice',
            tone: 'danger',
            reason: {
                label: 'Reason',
                placeholder: 'e.g. duplicate of the May invoice',
                required: true,
                requiredMessage: 'Add a reason to void this invoice.',
            },
        });
        if (!confirmed) return;
        await run('void', async () => {
            const result = await sendJson<InvoiceResponse>(invoiceUrl(invoice.id, '/void'), 'PATCH',
                {reason: reason.trim()}, 'The invoice could not be voided.');
            if ('error' in result) showError(`Couldn’t void ${name}`, result.error);
            else await afterChange('Invoice voided', name);
        });
    };

    const handleDelete = async () => {
        const {confirmed} = await confirm({
            title: `Delete ${name}?`,
            text: 'The manual draft is removed for good. Balances are not touched.',
            confirmLabel: 'Delete invoice',
            tone: 'danger',
        });
        if (!confirmed) return;
        await run('delete', async () => {
            const result = await sendJson<{ message?: string }>(invoiceUrl(invoice.id), 'DELETE', undefined,
                'Only manual drafts can be deleted.');
            if ('error' in result) {
                showError(`Couldn’t delete ${name}`, result.error);
                return;
            }
            showSuccess('Invoice deleted', name);
            onChanged();
            onClose();
        });
    };

    const handleSaveNotes = () => run('notes', async () => {
        const trimmed = notes.trim();
        const result = await sendJson<InvoiceResponse>(invoiceUrl(invoice.id, '/notes'), 'PATCH',
            {notes: trimmed || undefined}, 'The notes could not be saved.');
        if ('error' in result) showError('Couldn’t save the notes', result.error);
        else await afterChange('Notes saved', name);
    });

    const notesChanged = notes.trim() !== (invoice.notes ?? '').trim();
    const statusOptions = (['DRAFT', 'SENT', 'PAID'] as InvoiceStatus[]).filter((status) => status !== invoice.status);
    // History holds only admin status changes, so the creation row is inferred:
    // invoices start as drafts unless they were created already paid (exempt).
    const firstStatus = history?.[0]?.statusBefore
        ?? (invoice.createdAt === invoice.statusChangedAt ? invoice.status : 'DRAFT');

    const title = (
        <span className="inv-drawer-title">
            <span>{name}</span>
            <Tag tone={statusTone(invoice.status)}>{invoice.status}</Tag>
        </span>
    );

    return (
        <Drawer
            open
            wide
            flush
            title={title}
            eyebrow={<span className="inv-short-id">invoice {shortId(invoice.id)}</span>}
            onClose={onClose}
        >
            <DrawerSection>
                <Money value={invoice.totalAmount} className="inv-drawer-amount"/>
                <span className="inv-drawer-meta">
                    Invoice date {formatDate(invoice.invoiceDate)}
                    {open && ` · open ${plural(daysSince(invoice.invoiceDate), 'day')}`}
                    {invoice.origin === 'MANUAL' && ' · manual'}
                </span>
            </DrawerSection>

            {bankPayment && (
                <section className="ui-drawer-section inv-bank-line">
                    <span className="inv-bank-title">
                        Paid by bank transfer from {bankPayment.senderName || bankPayment.subscriberName || 'an unknown sender'}
                        {' · '}{formatInstantDate(bankPayment.occurredAt)}
                    </span>
                    <span className="inv-bank-sub">
                        {formatMoney(bankPayment.amount)} at {formatTime(bankPayment.occurredAt)}
                        {bankPayment.matchMethod && MATCH_TEXT[bankPayment.matchMethod] && ` · ${MATCH_TEXT[bankPayment.matchMethod]}`}
                    </span>
                    <Link to="/admin/bank-payments" className="inv-bank-link">Open bank payments →</Link>
                </section>
            )}

            {!detail ? (
                <DrawerSection>
                    <TableSkeleton columns="1fr 90px" rows={3}/>
                </DrawerSection>
            ) : (
                <>
                    <DrawerSection>
                        {detail.entries.length > 0 ? (
                            <div className="inv-lines">
                                {detail.entries.map((entry) => (
                                    <div key={entry.ledgerEntryId} className="inv-line">
                                        <span>
                                            {entry.subscriptionServiceName}
                                            <span className="ui-muted">
                                                {invoice.fromMonth !== invoice.toMonth && ` · ${formatMonth(entry.recordedMonth)}`}
                                                {` · ÷ ${entry.participantCount}`}
                                            </span>
                                        </span>
                                        <Money value={entry.amount}/>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className="inv-drawer-meta">
                                {invoice.origin === 'MANUAL'
                                    ? 'A manual invoice has no ledger lines.'
                                    : 'No ledger lines are linked to this invoice.'}
                            </span>
                        )}
                    </DrawerSection>

                    <DrawerSection>
                        <div className="inv-action-grid">
                            <button type="button" className="ui-btn is-small" onClick={handlePdf} disabled={busy !== null}>
                                {busy === 'pdf' ? 'Preparing…' : 'PDF'}
                            </button>
                            {invoice.status !== 'VOID' && (
                                <button type="button" className="ui-btn is-small" onClick={handleEmail} disabled={busy !== null}>
                                    {busy === 'email' ? 'Sending…' : 'Email'}
                                </button>
                            )}
                            {open && (
                                <button type="button" className="ui-btn is-small"
                                        onClick={() => setStatus('PAID', 'Marked paid')} disabled={busy !== null}>
                                    {busy === 'status-PAID' ? 'Saving…' : 'Mark paid'}
                                </button>
                            )}
                            {open && (
                                <button type="button" className="ui-btn is-small inv-balance-btn"
                                        onClick={handlePayFromBalance} disabled={busy !== null || !balanceCovers}>
                                    {busy === 'balance' ? 'Paying…' : 'Pay from balance'}
                                </button>
                            )}
                            <button type="button" className="ui-btn is-small" onClick={() => onDuplicate(invoice)}
                                    disabled={busy !== null}>
                                Duplicate
                            </button>
                            {open && (
                                <button type="button" className="ui-btn is-small inv-danger-btn" onClick={handleVoid}
                                        disabled={busy !== null}>
                                    {busy === 'void' ? 'Voiding…' : 'Void…'}
                                </button>
                            )}
                            {canDelete && (
                                <button type="button" className="ui-btn is-small inv-danger-btn" onClick={handleDelete}
                                        disabled={busy !== null}>
                                    {busy === 'delete' ? 'Deleting…' : 'Delete'}
                                </button>
                            )}
                        </div>
                        {open && balance !== null && !balanceCovers && (
                            <span className="inv-drawer-hint">
                                Pay from balance needs the balance to cover the whole invoice. {invoice.subscriberName} has {formatMoney(balance)}.
                            </span>
                        )}
                        {open && balanceCovers && (
                            <span className="inv-drawer-hint">
                                {invoice.subscriberName} has {formatMoney(balance)} on balance.
                            </span>
                        )}
                    </DrawerSection>

                    <DrawerSection title="Notes">
                        <textarea
                            className="ui-textarea"
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Add a note for yourself"
                            rows={3}
                            aria-label="Notes"
                        />
                        {notesChanged && (
                            <div className="inv-notes-actions">
                                <button type="button" className="ui-btn is-small"
                                        onClick={() => setNotes(invoice.notes ?? '')} disabled={busy !== null}>
                                    Cancel
                                </button>
                                <button type="button" className="ui-btn is-small is-dark" onClick={handleSaveNotes}
                                        disabled={busy !== null}>
                                    {busy === 'notes' ? 'Saving…' : 'Save notes'}
                                </button>
                            </div>
                        )}
                    </DrawerSection>

                    <DrawerSection title="Status history">
                        {history === null ? (
                            <TableSkeleton columns="62px 52px 1fr" rows={2}/>
                        ) : (
                            <div className="inv-history">
                                <div className="inv-history-row">
                                    <span className="inv-history-when">{formatInstantDate(invoice.createdAt).replace(/ \d{4}$/, '')}</span>
                                    <Tag tone={statusTone(firstStatus)}>{firstStatus}</Tag>
                                    <span>{creationText(invoice)}</span>
                                </div>
                                {history.map((item) => (
                                    <div key={item.actionId} className="inv-history-row">
                                        <span className="inv-history-when">{formatInstantDate(item.changedAt).replace(/ \d{4}$/, '')}</span>
                                        <Tag tone={statusTone(item.statusAfter)}>{item.statusAfter}</Tag>
                                        <span>{historyText(item)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {invoice.status !== 'VOID' && (
                            <label className="inv-status-change">
                                <span className="inv-drawer-hint">Set status by hand</span>
                                <select
                                    className="ui-select is-compact"
                                    value=""
                                    disabled={busy !== null}
                                    onChange={(event) => {
                                        const value = event.target.value as InvoiceStatus;
                                        if (value) void handleStatusChange(value);
                                    }}
                                >
                                    <option value="">Change to…</option>
                                    {statusOptions.map((status) => (
                                        <option key={status} value={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </DrawerSection>
                </>
            )}
        </Drawer>
    );
}
