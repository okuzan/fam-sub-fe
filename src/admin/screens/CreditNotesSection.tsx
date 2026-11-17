import {type FormEvent, useCallback, useEffect, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import {DateInput, DrawerSection, Field, Notice, Tag} from '../../ui/components';
import {useConfirm} from '../../ui/confirmContext';
import {formatDate, formatInstantDate, formatMoney, kyivToday, plural} from '../../ui/format';
import {getResponseErrorMessage} from '../../utils/errors';
import type {
    CreditNoteCreateRequest,
    CreditNoteCreateResult,
    CreditNoteResponse,
    CreditNoteUndoResult
} from '../../types/creditNote';
import type {SubscriberResponse} from '../../types/subscriber';
import {getJson} from './people';

interface Props {
    subscriber: SubscriberResponse;
    /** Their balance or invoices changed; reload what shows them. */
    onChanged: () => Promise<void> | void;
}

interface FormState {
    amount: string;
    occurredOn: string;
    reason: string;
    sendEmail: boolean;
}

const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;

/** "Settled 2 invoices, 372,00 ₴", or what happened to the money when it settled nothing. */
const settledLine = (note: CreditNoteResponse) =>
    note.settledInvoiceCount > 0
        ? `settled ${plural(note.settledInvoiceCount, 'invoice')}, ${formatMoney(note.settledAmount)}`
        : 'held as credit';

/**
 * Credit notes for one subscriber: money they paid on the group's behalf,
 * recorded with when and why instead of a bare balance edit.
 */
export default function CreditNotesSection({subscriber, onChanged}: Props) {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();
    const [notes, setNotes] = useState<CreditNoteResponse[] | null>(null);
    const [form, setForm] = useState<FormState | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setNotes(await getJson<CreditNoteResponse[]>(
                `${API_CONFIG.ADMIN_CREDIT_NOTES_URL}?subscriberId=${subscriber.id}`,
                'Could not load credit notes'
            ));
        } catch {
            setNotes([]);
        }
    }, [subscriber.id]);

    useEffect(() => {
        load();
    }, [load]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!form) return;
        const amountText = form.amount.trim().replace(',', '.');
        if (!AMOUNT_PATTERN.test(amountText) || Number(amountText) <= 0) {
            setFormError('Enter the amount they paid, like 250 or 99.50.');
            return;
        }
        if (!form.occurredOn) {
            setFormError('Choose the day they paid.');
            return;
        }
        if (!form.reason.trim()) {
            setFormError('Say what they paid for. It goes in the email and the history.');
            return;
        }
        setFormError(null);
        setBusy(true);
        try {
            const body: CreditNoteCreateRequest = {
                subscriberId: subscriber.id,
                amount: Number(amountText),
                occurredOn: form.occurredOn,
                reason: form.reason.trim(),
                sendEmail: form.sendEmail
            };
            const response = await apiFetch(API_CONFIG.ADMIN_CREDIT_NOTES_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                setFormError(await getResponseErrorMessage(response, 'Could not record the credit note.'));
                return;
            }
            const result = await response.json() as CreditNoteCreateResult;
            showSuccess(
                `Credited ${formatMoney(result.creditNote.amount)} to ${subscriber.name}`,
                `${settledLine(result.creditNote)}. Balance now ${formatMoney(result.balanceAfter)}.`
            );
            setForm(null);
            await Promise.all([load(), onChanged()]);
        } catch {
            setFormError('Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };

    const undo = async (note: CreditNoteResponse) => {
        const {confirmed} = await confirm({
            title: `Undo the ${formatMoney(note.amount)} credit note?`,
            text: note.settledInvoiceCount > 0
                ? `The ${plural(note.settledInvoiceCount, 'invoice')} it paid reopen and ${formatMoney(note.amount)} comes off ${subscriber.name}'s balance. No email is sent.`
                : `${formatMoney(note.amount)} comes off ${subscriber.name}'s balance. No email is sent.`,
            confirmLabel: 'Undo credit note',
            tone: 'danger'
        });
        if (!confirmed) return;
        setBusy(true);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_CREDIT_NOTES_URL}/${note.id}/undo`, {method: 'POST'});
            if (!response.ok) {
                showError('Could not undo the credit note', await getResponseErrorMessage(response, 'The server refused it.'));
                return;
            }
            const result = await response.json() as CreditNoteUndoResult;
            showSuccess(
                'Credit note undone',
                result.reopenedInvoiceIds.length > 0
                    ? `Reopened ${plural(result.reopenedInvoiceIds.length, 'invoice')}. Balance now ${formatMoney(result.balanceAfter)}.`
                    : `Balance now ${formatMoney(result.balanceAfter)}.`
            );
            await Promise.all([load(), onChanged()]);
        } catch {
            showError('Could not undo the credit note', 'Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };

    if (subscriber.billingExempt) return null;

    return (
        <DrawerSection title={`Paid on our behalf${notes && notes.length > 0 ? ` · ${notes.length}` : ''}`}>
            {notes === null ? (
                <span className="sub-muted">Loading…</span>
            ) : notes.length === 0 && form === null ? (
                <span className="sub-muted">
                    Nothing yet. When {subscriber.name} pays for something for you, record it here: it becomes credit that
                    pays their invoices, and they get an email saying what for.
                </span>
            ) : notes.map((note) => (
                <div key={note.id} className={`sub-credit-note${note.undoneAt ? ' is-undone' : ''}`}>
                    <div className="sub-credit-note-text">
                        <span className="sub-credit-note-reason">{note.reason}</span>
                        <span className="sub-muted">
                            {formatDate(note.occurredOn)} · {settledLine(note)}
                            {note.emailSentAt && ' · emailed'}
                            {note.undoneAt && <> · <Tag tone="grey">Undone {formatInstantDate(note.undoneAt)}</Tag></>}
                        </span>
                    </div>
                    <span className="sub-line-amount">{formatMoney(note.amount)}</span>
                    {!note.undoneAt && (
                        <button type="button" className="ui-link-btn is-muted" onClick={() => undo(note)} disabled={busy}>
                            Undo
                        </button>
                    )}
                </div>
            ))}

            {form === null ? (
                <div className="sub-detail-actions">
                    <button
                        type="button"
                        className="ui-btn is-small"
                        onClick={() => {
                            setFormError(null);
                            setForm({amount: '', occurredOn: kyivToday(), reason: '', sendEmail: true});
                        }}
                        disabled={busy}
                    >
                        Record credit note
                    </button>
                </div>
            ) : (
                <form className="sub-join" onSubmit={submit} noValidate>
                    {formError && <Notice tone="red">{formError}</Notice>}
                    <div className="sub-join-fields">
                        <Field label="Amount, ₴" htmlFor="sub-credit-amount">
                            <input
                                id="sub-credit-amount"
                                className="ui-input"
                                inputMode="decimal"
                                placeholder="250.00"
                                value={form.amount}
                                onChange={(event) => setForm({...form, amount: event.target.value})}
                            />
                        </Field>
                        <Field label="Paid on" htmlFor="sub-credit-date">
                            <DateInput
                                id="sub-credit-date"
                                value={form.occurredOn}
                                max={kyivToday()}
                                onChange={(value) => setForm({...form, occurredOn: value})}
                            />
                        </Field>
                    </div>
                    <Field label="What for" htmlFor="sub-credit-reason" hint="Shown to them in the email.">
                        <textarea
                            id="sub-credit-reason"
                            className="ui-textarea"
                            rows={2}
                            maxLength={2000}
                            placeholder="Paid for our dinner at Kanapa"
                            value={form.reason}
                            onChange={(event) => setForm({...form, reason: event.target.value})}
                        />
                    </Field>
                    <label className="ui-checkbox">
                        <input
                            type="checkbox"
                            checked={form.sendEmail}
                            onChange={(event) => setForm({...form, sendEmail: event.target.checked})}
                        />
                        Email {subscriber.name} what it was and what it paid
                    </label>
                    <div className="sub-detail-actions">
                        <button type="submit" className="ui-btn is-primary is-small" disabled={busy}>
                            {busy ? 'Recording…' : 'Record credit note'}
                        </button>
                        <button
                            type="button"
                            className="ui-btn is-small sub-edit-btn"
                            onClick={() => setForm(null)}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </DrawerSection>
    );
}
