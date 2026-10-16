import {type FormEvent, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import {Drawer, Field, Notice} from '../../ui/components';
import {formatMoney} from '../../ui/format';
import {getResponseErrorMessage} from '../../utils/errors';
import type {SubscriberCreateRequest, SubscriberResponse, SubscriberUpdateRequest} from '../../types/subscriber';
import {parseAmount} from './people';

interface SubscriberForm {
    name: string;
    surname: string;
    email: string;
    balance: string;
    billingExempt: boolean;
}

type FormErrors = Partial<Record<'name' | 'email' | 'balance', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(form: SubscriberForm): FormErrors {
    const errors: FormErrors = {};
    if (!form.name.trim()) errors.name = 'Enter their name.';
    if (!form.email.trim()) errors.email = 'Enter the email they sign in with.';
    else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'That doesn’t look like an email address.';
    if (form.balance.trim()) {
        const balance = parseAmount(form.balance);
        if (balance === null) errors.balance = 'Enter a number, e.g. 120,00.';
        else if (balance < 0) errors.balance = 'Credit balance cannot be negative. Use a manual invoice to record debt.';
        else if (Math.abs(Math.round(balance * 100) - balance * 100) > 1e-6) errors.balance = 'Use at most two decimal places.';
    }
    return errors;
}

interface Props {
    /** null adds a new subscriber. */
    subscriber: SubscriberResponse | null;
    onClose: () => void;
    onSaved: (saved: SubscriberResponse) => void;
}

/** Add or edit a subscriber. Mount it only while open, so it starts from the subscriber given. */
export default function SubscriberFormDrawer({subscriber, onClose, onSaved}: Props) {
    const {showSuccess} = useToast();
    const [form, setForm] = useState<SubscriberForm>(() => subscriber
        ? {
            name: subscriber.name,
            surname: subscriber.surname ?? '',
            email: subscriber.email,
            balance: String(subscriber.balance).replace('.', ','),
            billingExempt: subscriber.billingExempt
        }
        : {name: '', surname: '', email: '', balance: '', billingExempt: false});
    const [errors, setErrors] = useState<FormErrors>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const close = () => {
        if (!saving) onClose();
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const found = validate(form);
        setErrors(found);
        setServerError(null);
        if (Object.keys(found).length > 0) return;

        const request: SubscriberCreateRequest | SubscriberUpdateRequest = {
            name: form.name.trim(),
            surname: form.surname.trim() || null,
            email: form.email.trim(),
            balance: parseAmount(form.balance) ?? 0,
            billingExempt: form.billingExempt
        };
        setSaving(true);
        try {
            const response = await apiFetch(
                subscriber ? `${API_CONFIG.SUBSCRIBERS_URL}/${subscriber.id}` : API_CONFIG.SUBSCRIBERS_URL,
                {
                    method: subscriber ? 'PUT' : 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(request)
                }
            );
            if (!response.ok) {
                setServerError(await getResponseErrorMessage(response, 'Could not save the subscriber.'));
                return;
            }
            const saved = await response.json() as SubscriberResponse;
            showSuccess(subscriber ? 'Subscriber updated' : 'Subscriber added', saved.name);
            onSaved(saved);
        } catch {
            setServerError('Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    const enablingExempt = form.billingExempt && !subscriber?.billingExempt;

    return (
        <Drawer
            open
            title={subscriber ? `Edit ${subscriber.name}` : 'Add subscriber'}
            onClose={close}
            footer={(
                <>
                    <button type="button" className="ui-btn" onClick={close} disabled={saving}>Cancel</button>
                    <button type="submit" form="sub-form" className="ui-btn is-primary" disabled={saving}>
                        {saving ? 'Saving…' : subscriber ? 'Save subscriber' : 'Add subscriber'}
                    </button>
                </>
            )}
        >
            <form id="sub-form" className="sub-form" onSubmit={handleSubmit} noValidate>
                {serverError && <Notice tone="red">{serverError}</Notice>}
                <Field label="Name" htmlFor="sub-name" error={errors.name}>
                    <input
                        id="sub-name"
                        className="ui-input"
                        value={form.name}
                        onChange={(event) => setForm({...form, name: event.target.value})}
                        autoFocus
                    />
                </Field>
                <Field
                    label="Surname"
                    optional
                    htmlFor="sub-surname"
                    hint="As their bank writes it, e.g. Чернишова. A transfer from someone with this name and surname is applied to them on its own."
                >
                    <input
                        id="sub-surname"
                        className="ui-input"
                        value={form.surname}
                        onChange={(event) => setForm({...form, surname: event.target.value})}
                    />
                </Field>
                <Field
                    label="Email"
                    htmlFor="sub-email"
                    error={errors.email}
                    hint="Their Google account. Only listed emails can sign in to the cabinet."
                >
                    <input
                        id="sub-email"
                        type="email"
                        className="ui-input"
                        value={form.email}
                        onChange={(event) => setForm({...form, email: event.target.value})}
                        placeholder="name@gmail.com"
                    />
                </Field>
                <Field
                    label="Credit balance"
                    optional
                    htmlFor="sub-balance"
                    error={errors.balance}
                    hint={subscriber
                        ? `Prepaid credit, now ${formatMoney(subscriber.balance)}. Saving replaces it with this value; only the activity log keeps the old one.`
                        : 'Prepaid credit they start with, in hryvnias.'}
                >
                    <input
                        id="sub-balance"
                        className="ui-input is-money"
                        inputMode="decimal"
                        value={form.balance}
                        onChange={(event) => setForm({...form, balance: event.target.value})}
                        placeholder="0,00"
                    />
                </Field>
                <div className="ui-field">
                    <label className="ui-checkbox" htmlFor="sub-exempt">
                        <input
                            id="sub-exempt"
                            type="checkbox"
                            checked={form.billingExempt}
                            onChange={(event) => setForm({...form, billingExempt: event.target.checked})}
                        />
                        Billing exempt
                    </label>
                    <span className="ui-field-hint">
                        Still shares costs, so everyone else’s split stays right, but is never billed:
                        their invoices are created already paid and their balance is never touched.
                    </span>
                </div>
                {enablingExempt && subscriber && (
                    <Notice tone="clay">
                        Turning this on also marks every invoice {subscriber.name} owes now as paid. It is a waiver, not a payment.
                    </Notice>
                )}
            </form>
        </Drawer>
    );
}
