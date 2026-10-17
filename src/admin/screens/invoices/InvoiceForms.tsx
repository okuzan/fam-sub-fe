import {type FormEvent, useState} from 'react';
import {useToast} from '../../../components/ToastContext';
import {API_CONFIG} from '../../../config/api';
import {Drawer, Field} from '../../../ui/components';
import {formatMoney, formatMonth, formatMonthLong, formatPeriod, plural} from '../../../ui/format';
import type {
    InvoiceDuplicateRequest,
    InvoiceGenerationRequest,
    InvoiceGenerationResult,
    InvoiceResponse,
    InvoiceSuggestion,
    ManualInvoiceCreateRequest
} from '../../../types/invoice';
import type {SubscriberResponse} from '../../../types/subscriber';
import {invoiceName, invoiceUrl, sendJson, suggestedPeriod, todayIso} from './invoiceUtils';
import SubscriberOptions from '../SubscriberOptions';
import {fullName} from '../../subscriberNames';

interface GenerateDrawerProps {
    suggestion: InvoiceSuggestion | null;
    subscribers: SubscriberResponse[];
    onClose: () => void;
    onDone: () => void;
}

export function GenerateDrawer({suggestion, subscribers, onClose, onDone}: GenerateDrawerProps) {
    const {showSuccess, showError} = useToast();
    const initial = suggestedPeriod(suggestion);
    const [fromMonth, setFromMonth] = useState(initial?.fromMonth ?? '');
    const [toMonth, setToMonth] = useState(initial?.toMonth ?? '');
    const [subscriberId, setSubscriberId] = useState('');
    const [sendEmail, setSendEmail] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const nextErrors: Record<string, string> = {};
        if (!fromMonth) nextErrors.fromMonth = 'Pick the first month.';
        if (!toMonth) nextErrors.toMonth = 'Pick the last month.';
        else if (fromMonth && toMonth < fromMonth) nextErrors.toMonth = 'The last month can’t be before the first.';
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setSaving(true);
        const request: InvoiceGenerationRequest = {
            fromMonth,
            toMonth,
            subscriberId: subscriberId || undefined,
            sendEmail,
        };
        const result = await sendJson<InvoiceGenerationResult>(`${API_CONFIG.INVOICES_URL}/generate`, 'POST', request,
            'The invoices could not be generated.');
        setSaving(false);
        if ('error' in result) {
            showError('Couldn’t generate invoices', result.error);
            return;
        }
        const data = result.data;
        const exemptIds = new Set(subscribers.filter((s) => s.billingExempt).map((s) => s.id));
        const exempt = data.items.filter((item) => exemptIds.has(item.subscriberId)).length;
        const emailed = data.items.filter((item) => item.emailSent).length;
        const parts = [
            sendEmail ? `${emailed} of ${data.items.length - exempt} emailed` : plural(data.invoicesCreated - exempt, 'draft'),
        ];
        if (exempt > 0) parts.push(`${exempt} paid for exempt family`);
        parts.push(formatMoney(data.totalAmount));
        const period = fromMonth === toMonth ? formatMonthLong(fromMonth) : formatPeriod(fromMonth, toMonth);
        showSuccess(`${period} invoices generated`, parts.join(' · '));
        onDone();
    };

    return (
        <Drawer
            open
            title="Generate for period"
            eyebrow="Invoices"
            onClose={onClose}
            footer={(
                <>
                    <button type="button" className="ui-btn" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="submit" form="inv-generate-form" className="ui-btn is-primary" disabled={saving}>
                        {saving ? 'Generating…' : 'Generate invoices'}
                    </button>
                </>
            )}
        >
            <form id="inv-generate-form" className="inv-form" onSubmit={handleSubmit} noValidate>
                <p className="inv-form-lead">
                    Each subscriber gets one invoice for their uninvoiced ledger lines in the period.
                    {suggestion?.lastInvoicedToMonth && ` Invoiced so far up to ${formatMonth(suggestion.lastInvoicedToMonth)}.`}
                </p>
                <div className="inv-form-row">
                    <Field label="From" htmlFor="inv-gen-from" error={errors.fromMonth}>
                        <input id="inv-gen-from" type="month" className="ui-input" value={fromMonth}
                               onChange={(event) => setFromMonth(event.target.value)}/>
                    </Field>
                    <Field label="To" htmlFor="inv-gen-to" error={errors.toMonth}>
                        <input id="inv-gen-to" type="month" className="ui-input" value={toMonth} min={fromMonth}
                               onChange={(event) => setToMonth(event.target.value)}/>
                    </Field>
                </div>
                <Field label="Subscriber" optional htmlFor="inv-gen-subscriber"
                       hint="Leave on everyone to bill the whole group.">
                    <select id="inv-gen-subscriber" className="ui-select" value={subscriberId}
                            onChange={(event) => setSubscriberId(event.target.value)}>
                        <option value="">Everyone</option>
                        <SubscriberOptions subscribers={subscribers}/>
                    </select>
                </Field>
                <label className="ui-checkbox">
                    <input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)}/>
                    Email the invoices right away
                </label>
                <span className="ui-field-hint">
                    Otherwise they stay drafts until you email them. Exempt family is created already paid either way.
                </span>
            </form>
        </Drawer>
    );
}

interface ManualInvoiceDrawerProps {
    /** Set when duplicating: the form starts from this invoice. */
    source: InvoiceResponse | null;
    subscribers: SubscriberResponse[];
    onClose: () => void;
    onDone: () => void;
}

export function ManualInvoiceDrawer({source, subscribers, onClose, onDone}: ManualInvoiceDrawerProps) {
    const {showSuccess, showError} = useToast();
    const [subscriberId, setSubscriberId] = useState(source?.subscriberId ?? '');
    const [amount, setAmount] = useState(source ? String(source.totalAmount) : '');
    const [invoiceDate, setInvoiceDate] = useState(todayIso());
    const [notes, setNotes] = useState(source?.notes ?? '');
    const [sendEmail, setSendEmail] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const nextErrors: Record<string, string> = {};
        const cleaned = amount.replace(/\s/g, '');
        const parsed = Number(cleaned.replace(',', '.'));
        if (!subscriberId) nextErrors.subscriberId = 'Pick who the invoice is for.';
        if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) nextErrors.amount = 'Enter an amount like 240 or 240,50.';
        else if (parsed <= 0) nextErrors.amount = 'Enter an amount above zero.';
        if (!invoiceDate) nextErrors.invoiceDate = 'Pick the invoice date.';
        if (!source && !notes.trim()) nextErrors.notes = 'Say what this invoice is for.';
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        const request: ManualInvoiceCreateRequest | InvoiceDuplicateRequest = {
            subscriberId,
            amount: Math.round(parsed * 100) / 100,
            invoiceDate,
            notes: notes.trim(),
            sendEmail,
        };
        setSaving(true);
        const result = await sendJson<InvoiceResponse>(
            source ? invoiceUrl(source.id, '/duplicate') : `${API_CONFIG.INVOICES_URL}/manual`,
            'POST',
            request,
            source ? 'The invoice could not be duplicated.' : 'The invoice could not be created.'
        );
        setSaving(false);
        if ('error' in result) {
            showError(source ? 'Couldn’t duplicate the invoice' : 'Couldn’t create the invoice', result.error);
            return;
        }
        const created = result.data;
        showSuccess(
            source ? 'Invoice duplicated' : 'Manual invoice created',
            `${created.subscriberName} · ${formatMoney(created.totalAmount)} · ${created.status.toLowerCase()}`
        );
        onDone();
    };

    return (
        <Drawer
            open
            title={source ? 'Duplicate invoice' : 'Manual invoice'}
            eyebrow={source ? `From ${invoiceName(source)}` : 'Invoices'}
            onClose={onClose}
            footer={(
                <>
                    <button type="button" className="ui-btn" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="submit" form="inv-manual-form" className="ui-btn is-primary" disabled={saving}>
                        {saving ? 'Saving…' : source ? 'Create copy' : 'Create invoice'}
                    </button>
                </>
            )}
        >
            <form id="inv-manual-form" className="inv-form" onSubmit={handleSubmit} noValidate>
                <p className="inv-form-lead">
                    {source
                        ? 'Creates a new manual invoice that starts from this one. Change who it is for, the amount or the note.'
                        : 'A one-off invoice outside the ledger, for example debt from before FamSub. Use it instead of a negative balance.'}
                </p>
                <Field label="Subscriber" htmlFor="inv-manual-subscriber" error={errors.subscriberId}>
                    <select id="inv-manual-subscriber" className="ui-select" value={subscriberId}
                            onChange={(event) => setSubscriberId(event.target.value)}>
                        <option value="">Select subscriber</option>
                        <SubscriberOptions subscribers={subscribers}
                            label={(subscriber) => `${fullName(subscriber)}${subscriber.billingExempt ? ' · exempt' : ''}`}/>
                    </select>
                </Field>
                <div className="inv-form-row">
                    <Field label="Amount, ₴" htmlFor="inv-manual-amount" error={errors.amount}>
                        <input id="inv-manual-amount" className="ui-input is-money" inputMode="decimal" value={amount}
                               placeholder="0,00" onChange={(event) => setAmount(event.target.value)}/>
                    </Field>
                    <Field label="Invoice date" htmlFor="inv-manual-date" error={errors.invoiceDate}>
                        <input id="inv-manual-date" type="date" className="ui-input" value={invoiceDate}
                               onChange={(event) => setInvoiceDate(event.target.value)}/>
                    </Field>
                </div>
                <Field label="Description" optional={Boolean(source)} htmlFor="inv-manual-notes" error={errors.notes}
                       hint="Shown on the invoice and its email.">
                    <textarea id="inv-manual-notes" className="ui-textarea" rows={4} value={notes}
                              placeholder="What is this invoice for?" onChange={(event) => setNotes(event.target.value)}/>
                </Field>
                <label className="ui-checkbox">
                    <input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)}/>
                    Email it right away
                </label>
            </form>
        </Drawer>
    );
}
