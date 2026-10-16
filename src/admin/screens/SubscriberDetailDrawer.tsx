import {type FormEvent, useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {API_CONFIG, apiFetch, getPayPageUrl} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import {Drawer, DrawerSection, Field, Notice, Tag} from '../../ui/components';
import {useConfirm} from '../../ui/confirmContext';
import {
    currentMonth,
    daysSince,
    formatInstantDate,
    formatMoney,
    formatMonth,
    formatPeriod,
    plural
} from '../../ui/format';
import {getResponseErrorMessage} from '../../utils/errors';
import type {BankSenderResponse} from '../../types/bankPayment';
import type {InvoiceFilterRequest, InvoiceResponse} from '../../types/invoice';
import type {MembershipCreateRequest, MembershipResponse} from '../../types/membership';
import type {SubscriptionServiceResponse} from '../../types/subscription';
import type {
    SubscriberDebtPaymentResult,
    SubscriberDetailResponse,
    SubscriberResponse,
    UnpaidInvoiceDto
} from '../../types/subscriber';
import {archivedSince, evenShare, getJson} from './people';

interface Props {
    subscriber: SubscriberResponse;
    /** Active members per service name this month, for the share column. */
    membersByServiceName: Map<string, number>;
    /** Every membership this subscriber ever had, for an archived person's history. */
    memberships: MembershipResponse[];
    /** The services a new membership can be on. */
    services: SubscriptionServiceResponse[];
    onClose: () => void;
    onEdit: () => void;
    /** Something about this subscriber changed; reload the list. */
    onChanged: () => Promise<void> | void;
    onDeleted: () => void;
}

const PAYABLE = ['DRAFT', 'SENT'];

function CreditChoice({balance, onChange}: { balance: number; onChange: (value: boolean) => void }) {
    const [checked, setChecked] = useState(false);
    return (
        <label className="ui-checkbox sub-credit-choice">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                    setChecked(event.target.checked);
                    onChange(event.target.checked);
                }}
            />
            Also clear their {formatMoney(balance)} credit
        </label>
    );
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const membershipRange = (membership: MembershipResponse) =>
    membership.endMonth ? formatPeriod(membership.startMonth, membership.endMonth) : `since ${formatMonth(membership.startMonth)}`;

/** "Netflix", "Netflix and Spotify", "Netflix, Spotify and YouTube". */
const joinNames = (names: string[]) =>
    names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** "Archived on 1 Aug 2026. Their Netflix membership ended in Jul 2026 and the last invoice was paid on 3 Aug 2026." */
const archivedSentence = (subscriber: SubscriberResponse) => {
    const services = subscriber.formerServices;
    const membership = subscriber.lastMembershipEndMonth
        ? `Their ${joinNames(services)} ${services.length > 1 ? 'memberships' : 'membership'} ended in ${formatMonth(subscriber.lastMembershipEndMonth)}`
        : 'They never had a membership';
    const invoice = subscriber.billingExempt
        ? 'their invoices are created already paid'
        : subscriber.lastInvoicePaidAt
            ? `the last invoice was paid on ${formatInstantDate(subscriber.lastInvoicePaidAt)}`
            : 'they never had an invoice to pay';
    return `Archived on ${formatInstantDate(archivedSince(subscriber))}. ${membership} and ${invoice}.`;
};

/** Paid invoices, newest first, for an archived person's invoice line. */
const fetchPaidInvoices = async (subscriberId: string): Promise<InvoiceResponse[]> => {
    const request: InvoiceFilterRequest = {subscriberId, status: 'PAID'};
    const response = await apiFetch(`${API_CONFIG.INVOICES_URL}/filter`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(await getResponseErrorMessage(response, 'Could not load invoices'));
    const invoices = await response.json() as InvoiceResponse[];
    return invoices.sort((a, b) => Date.parse(b.statusChangedAt) - Date.parse(a.statusChangedAt));
};

const invoiceMonth = (invoice: InvoiceResponse) =>
    formatMonth(invoice.origin === 'MANUAL' ? invoice.invoiceDate.slice(0, 7) : invoice.toMonth);

const invoicePeriod = (invoice: UnpaidInvoiceDto) =>
    invoice.origin === 'SUBSCRIPTION_LEDGER' ? formatPeriod(invoice.fromMonth, invoice.toMonth) : 'Manual invoice';

export default function SubscriberDetailDrawer({
    subscriber,
    membersByServiceName,
    memberships,
    services,
    onClose,
    onEdit,
    onChanged,
    onDeleted
}: Props) {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();
    const [details, setDetails] = useState<SubscriberDetailResponse | null>(null);
    const [senders, setSenders] = useState<BankSenderResponse[] | null>(null);
    const [debtResult, setDebtResult] = useState<SubscriberDebtPaymentResult | null>(null);
    const [busy, setBusy] = useState<'pay' | 'email' | 'delete' | 'join' | null>(null);
    /** The archived person's "Add membership" form; null while closed. */
    const [joinForm, setJoinForm] = useState<{ serviceId: string; startMonth: string } | null>(null);
    const [joinError, setJoinError] = useState<string | null>(null);
    /** An archived person's paid invoices; null while loading or when not archived. */
    const [paidInvoices, setPaidInvoices] = useState<InvoiceResponse[] | null>(null);

    useEffect(() => {
        if (!subscriber.archived) return;
        let current = true;
        fetchPaidInvoices(subscriber.id)
            .then((invoices) => current && setPaidInvoices(invoices))
            .catch(() => current && setPaidInvoices([]));
        return () => {
            current = false;
        };
    }, [subscriber.id, subscriber.archived]);
    const includeCredit = useRef(false);

    const loadDetails = useCallback(async () => {
        try {
            setDetails(await getJson<SubscriberDetailResponse>(
                `${API_CONFIG.SUBSCRIBERS_URL}/${subscriber.id}/details`,
                'Could not load the subscriber'
            ));
        } catch (error) {
            showError('Could not load the subscriber', error instanceof Error ? error.message : undefined);
        }
    }, [subscriber.id, showError]);

    const loadSenders = useCallback(async () => {
        try {
            const all = await getJson<BankSenderResponse[]>(
                `${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/senders`,
                'Could not load bank senders'
            );
            setSenders(all.filter((sender) => sender.subscriberId === subscriber.id));
        } catch {
            setSenders([]);
        }
    }, [subscriber.id]);

    useEffect(() => {
        loadDetails();
        loadSenders();
    }, [loadDetails, loadSenders]);

    const copyPayLink = () => {
        if (!details) return;
        navigator.clipboard.writeText(getPayPageUrl(details.payToken))
            .then(() => showSuccess('Pay link copied', `Send it to ${details.name}.`))
            .catch(() => showError('Could not copy the pay link'));
    };

    const emailSituation = async () => {
        setBusy('email');
        try {
            const response = await apiFetch(`${API_CONFIG.SUBSCRIBERS_URL}/${subscriber.id}/email-situation`, {method: 'POST'});
            if (!response.ok) {
                showError('Could not send the email', await getResponseErrorMessage(response, 'The server refused it.'));
                return;
            }
            const result = await response.json().catch(() => null) as { message?: string } | null;
            showSuccess(`Situation email sent to ${subscriber.name}`, result?.message);
        } catch {
            showError('Could not send the email', 'Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };

    const payOffDebt = async () => {
        if (!details) return;
        const payable = details.unpaidInvoices.filter((invoice) => PAYABLE.includes(invoice.status));
        if (payable.length === 0) return;
        const total = payable.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
        includeCredit.current = false;
        const {confirmed} = await confirm({
            title: `Mark ${plural(payable.length, 'invoice')} as paid?`,
            text: (
                <>
                    Records that {details.name} paid {formatMoney(total)} outside the bank feed. They get an email
                    saying the debt is paid.
                    {details.balance > 0 && (
                        <CreditChoice balance={details.balance} onChange={(value) => {
                            includeCredit.current = value;
                        }}/>
                    )}
                </>
            ),
            confirmLabel: 'Mark as paid',
            tone: 'primary'
        });
        if (!confirmed) return;

        setBusy('pay');
        setDebtResult(null);
        try {
            const response = await apiFetch(
                `${API_CONFIG.SUBSCRIBERS_URL}/${subscriber.id}/pay-off-debt?includeCredit=${includeCredit.current}`,
                {method: 'POST'}
            );
            if (!response.ok) {
                showError('Could not pay off the debt', await getResponseErrorMessage(response, 'The server refused it.'));
                return;
            }
            const result = await response.json() as SubscriberDebtPaymentResult;
            setDebtResult(result);
            showSuccess(
                `Paid ${plural(result.paidCount, 'invoice')} for ${result.subscriberName}`,
                result.creditWrittenOff > 0
                    ? `${formatMoney(result.totalPaidAmount)}, credit cleared ${formatMoney(result.creditWrittenOff)}`
                    : formatMoney(result.totalPaidAmount)
            );
            await Promise.all([loadDetails(), onChanged()]);
        } catch {
            showError('Could not pay off the debt', 'Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };

    const deleteSubscriber = async () => {
        const {confirmed} = await confirm({
            title: `Delete ${subscriber.name}?`,
            text: 'Only someone with no memberships, invoices or payments can be deleted. Otherwise, end their memberships instead.',
            confirmLabel: 'Delete subscriber',
            tone: 'danger'
        });
        if (!confirmed) return;
        setBusy('delete');
        try {
            const response = await apiFetch(`${API_CONFIG.SUBSCRIBERS_URL}/${subscriber.id}`, {method: 'DELETE'});
            if (!response.ok) {
                showError(
                    `Could not delete ${subscriber.name}`,
                    await getResponseErrorMessage(response, 'The server refused the delete.')
                );
                return;
            }
            showSuccess('Subscriber deleted', subscriber.name);
            onDeleted();
        } catch {
            showError(`Could not delete ${subscriber.name}`, 'Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };

    const forgetSender = async (sender: BankSenderResponse) => {
        const name = sender.senderName ?? 'this sender';
        const {confirmed} = await confirm({
            title: `Forget ${name}?`,
            text: `Their next transfers will wait in bank review instead of going to ${subscriber.name} automatically. Past payments stay as they are.`,
            confirmLabel: 'Forget sender',
            tone: 'danger'
        });
        if (!confirmed) return;
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}/senders/${sender.id}`, {method: 'DELETE'});
            if (!response.ok) {
                showError('Could not forget the sender', await getResponseErrorMessage(response, 'The server refused it.'));
                return;
            }
            showSuccess('Sender forgotten', name);
            await loadSenders();
        } catch {
            showError('Could not forget the sender', 'Could not reach the server.');
        }
    };

    const addMembership = async (event: FormEvent) => {
        event.preventDefault();
        if (!joinForm) return;
        if (!joinForm.serviceId) {
            setJoinError('Choose the service.');
            return;
        }
        if (!MONTH_PATTERN.test(joinForm.startMonth)) {
            setJoinError('Choose the first month they pay for.');
            return;
        }
        setJoinError(null);
        setBusy('join');
        try {
            const body: MembershipCreateRequest = {
                subscriberId: subscriber.id,
                subscriptionServiceId: joinForm.serviceId,
                startMonth: joinForm.startMonth
            };
            const response = await apiFetch(API_CONFIG.MEMBERSHIPS_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                setJoinError(await getResponseErrorMessage(response, 'Could not add the membership.'));
                return;
            }
            const saved = await response.json() as MembershipResponse;
            showSuccess('Membership added', `${saved.subscriberName} · ${saved.subscriptionServiceName}, back in Active`);
            setJoinForm(null);
            await Promise.all([loadDetails(), onChanged()]);
        } catch {
            setJoinError('Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };

    const owed = details?.totalAmountOwed ?? 0;
    const balance = details?.balance ?? subscriber.balance;
    const payable = details?.unpaidInvoices.filter((invoice) => PAYABLE.includes(invoice.status)) ?? [];
    const payLink = details ? getPayPageUrl(details.payToken) : '';

    return (
        <Drawer open title={subscriber.name} onClose={() => busy === null && onClose()} flush wide>
            {subscriber.archived ? (
                <>
                    <DrawerSection>
                        <span className="sub-detail-email">{subscriber.email}</span>
                        <span className="sub-detail-exempt"><Tag tone="grey">Archived</Tag></span>
                        <p className="sub-archived-why">{archivedSentence(subscriber)}</p>
                        <div className="sub-figures">
                            <div className="sub-figure">
                                <span className="ui-label">Owes</span>
                                <span className="sub-figure-value">{formatMoney(details?.totalAmountOwed ?? 0)}</span>
                            </div>
                            <div className="sub-figure">
                                <span className="ui-label">Balance</span>
                                <span className="sub-figure-value">{formatMoney(balance)}</span>
                            </div>
                        </div>
                        {joinForm === null ? (
                            <>
                                <div className="sub-detail-actions">
                                    <button
                                        type="button"
                                        className="ui-btn is-primary is-small"
                                        onClick={() => {
                                            setJoinError(null);
                                            setJoinForm({serviceId: '', startMonth: currentMonth()});
                                        }}
                                        disabled={busy !== null}
                                    >
                                        Add membership
                                    </button>
                                    <button type="button" className="ui-btn is-small" onClick={onEdit} disabled={busy !== null}>
                                        Edit
                                    </button>
                                    <button type="button" className="ui-btn is-small sub-edit-btn" onClick={copyPayLink} disabled={!details}>
                                        Copy pay link
                                    </button>
                                </div>
                                <span className="sub-muted">Adding a membership moves them back to Active.</span>
                            </>
                        ) : (
                            <form className="sub-join" onSubmit={addMembership} noValidate>
                                {joinError && <Notice tone="red">{joinError}</Notice>}
                                <div className="sub-join-fields">
                                    <Field label="Service" htmlFor="sub-join-service">
                                        <select
                                            id="sub-join-service"
                                            className="ui-select"
                                            value={joinForm.serviceId}
                                            onChange={(event) => setJoinForm({...joinForm, serviceId: event.target.value})}
                                        >
                                            <option value="">Choose a service</option>
                                            {services.map((service) => (
                                                <option key={service.id} value={service.id}>{service.name}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field label="Start month" htmlFor="sub-join-start">
                                        <input
                                            id="sub-join-start"
                                            type="month"
                                            className="ui-input"
                                            value={joinForm.startMonth}
                                            onChange={(event) => setJoinForm({...joinForm, startMonth: event.target.value})}
                                        />
                                    </Field>
                                </div>
                                <div className="sub-detail-actions">
                                    <button type="submit" className="ui-btn is-primary is-small" disabled={busy !== null}>
                                        {busy === 'join' ? 'Adding…' : 'Add membership'}
                                    </button>
                                    <button
                                        type="button"
                                        className="ui-btn is-small sub-edit-btn"
                                        onClick={() => setJoinForm(null)}
                                        disabled={busy !== null}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        )}
                    </DrawerSection>

                    <DrawerSection title={`Past memberships · ${memberships.length}`}>
                        {memberships.length === 0 ? (
                            <span className="sub-muted">Never on a service.</span>
                        ) : [...memberships]
                            .sort((a, b) => b.startMonth.localeCompare(a.startMonth))
                            .map((membership) => (
                                <div key={membership.id} className="sub-line">
                                    <span>{membership.subscriptionServiceName}</span>
                                    <span className="sub-muted">{membershipRange(membership)}</span>
                                </div>
                            ))}
                    </DrawerSection>

                    <DrawerSection title="Invoices">
                        <span className="sub-muted">
                            {paidInvoices === null
                                ? 'Loading…'
                                : paidInvoices.length === 0
                                    ? 'No invoices yet.'
                                    : `All ${paidInvoices.length} paid · last: ${invoiceMonth(paidInvoices[0])}, ${formatMoney(paidInvoices[0].totalAmount)}`}
                        </span>
                        <Link to={`/admin/invoices?subscriber=${subscriber.id}`} className="ui-link-btn sub-archived-link">
                            See their invoices →
                        </Link>
                    </DrawerSection>
                </>
            ) : (
                <>
                    <DrawerSection>
                        <span className="sub-detail-email">{subscriber.email}</span>
                        {subscriber.billingExempt && (
                            <span className="sub-detail-exempt">
                                <Tag tone="grey">Exempt</Tag> Shares costs, never billed.
                            </span>
                        )}
                        <div className="sub-figures">
                            <div className="sub-figure">
                                <span className="ui-label">Owes</span>
                                <span className="sub-figure-value">{details ? formatMoney(owed) : '…'}</span>
                            </div>
                            <div className="sub-figure">
                                <span className="ui-label">Balance</span>
                                <span className={`sub-figure-value ${balance > 0 ? 'is-green' : ''}`}>{formatMoney(balance)}</span>
                            </div>
                        </div>
                        <div className="sub-detail-actions">
                            <button type="button" className="ui-btn is-primary is-small" onClick={copyPayLink} disabled={!details}>
                                Copy pay link
                            </button>
                            <button type="button" className="ui-btn is-small" onClick={emailSituation} disabled={busy !== null}>
                                {busy === 'email' ? 'Sending…' : 'Email situation'}
                            </button>
                            <button type="button" className="ui-btn is-small sub-edit-btn" onClick={onEdit} disabled={busy !== null}>
                                Edit
                            </button>
                        </div>
                        {details && <span className="sub-pay-link" title={payLink}>{payLink}</span>}
                    </DrawerSection>

                    {!details ? (
                        <DrawerSection>
                            <span className="sub-muted">Loading…</span>
                        </DrawerSection>
                    ) : (
                        <>
                            <DrawerSection title={`Memberships · ${details.activeSubscriptions.length}`}>
                                {details.activeSubscriptions.length === 0 ? (
                                    <span className="sub-muted">Not on any service now.</span>
                                ) : details.activeSubscriptions.map((membership) => {
                                    const members = membersByServiceName.get(membership.serviceName) ?? 0;
                                    return (
                                        <div key={membership.id} className="sub-line">
                                            <span>
                                                {membership.serviceName}{' '}
                                                <span className="sub-muted">· since {formatMonth(membership.startMonth)}</span>
                                            </span>
                                            <span
                                                className="sub-line-amount"
                                                title={members > 0
                                                    ? `${formatMoney(membership.servicePrice)} split ${members} ways`
                                                    : 'Full price'}
                                            >
                                                {formatMoney(evenShare(membership.servicePrice, members))}
                                            </span>
                                        </div>
                                    );
                                })}
                            </DrawerSection>

                            <DrawerSection title={`Open invoices · ${details.unpaidInvoices.length}`}>
                                {details.unpaidInvoices.length === 0 ? (
                                    <span className="sub-muted">Nothing open.</span>
                                ) : details.unpaidInvoices.map((invoice) => (
                                    <div key={invoice.id} className="sub-line">
                                        <span>
                                            {invoicePeriod(invoice)}{' '}
                                            <span className="sub-muted">
                                                · {invoice.status === 'DRAFT' ? 'draft, ' : ''}open {plural(daysSince(invoice.invoiceDate), 'day')}
                                            </span>
                                            {invoice.notes && <span className="ui-cell-sub">{invoice.notes}</span>}
                                        </span>
                                        <span className="sub-line-amount">{formatMoney(invoice.totalAmount)}</span>
                                    </div>
                                ))}
                                {payable.length > 0 && (
                                    <div className="sub-payoff">
                                        <button type="button" className="ui-btn is-small" onClick={payOffDebt} disabled={busy !== null}>
                                            {busy === 'pay' ? 'Paying…' : 'Pay off debt'}
                                        </button>
                                        <span className="sub-muted">Marks every draft and sent invoice as paid.</span>
                                    </div>
                                )}
                                {debtResult && (
                                    <Notice tone="green">
                                        Paid {debtResult.paidCount} of {debtResult.attemptedCount}, {formatMoney(debtResult.totalPaidAmount)}.
                                        {debtResult.creditWrittenOff > 0 && ` Credit cleared ${formatMoney(debtResult.creditWrittenOff)}.`}
                                        {' '}Balance now {formatMoney(debtResult.balanceAfter)}.
                                        {debtResult.items.filter((item) => !item.paid).map((item) => (
                                            <span key={item.invoiceId} className="sub-skip">
                                                Skipped {formatMoney(item.invoiceAmount)} ({item.statusBefore.toLowerCase()}): {item.message}
                                            </span>
                                        ))}
                                    </Notice>
                                )}
                            </DrawerSection>
                        </>
                    )}
                </>
            )}

            <DrawerSection title={`Bank senders who pay for ${subscriber.name}`}>
                {senders === null ? (
                    <span className="sub-muted">Loading…</span>
                ) : senders.length === 0 ? (
                    <span className="sub-muted">
                        None yet. A sender is learned when a transfer carries their payment code or you link it in bank review.
                    </span>
                ) : senders.map((sender) => (
                    <div key={sender.id} className="sub-sender">
                        <div className="sub-sender-text">
                            <span className="sub-sender-name">{sender.senderName ?? 'Unnamed sender'}</span>
                            <span className="sub-muted">
                                {sender.learnedAutomatically ? 'Learned from a payment' : 'Linked by hand'} · {formatInstantDate(sender.createdAt)}
                            </span>
                        </div>
                        <button type="button" className="ui-link-btn is-muted" onClick={() => forgetSender(sender)}>Forget</button>
                    </div>
                ))}
                {subscriber.archived && (
                    <span className="sub-muted">
                        Transfers from them still match automatically. The money lands on their balance and they show
                        as Holds credit in Active. They can still sign in to their cabinet.
                    </span>
                )}
            </DrawerSection>

            <DrawerSection>
                <div className="sub-danger">
                    <button type="button" className="ui-link-btn is-danger" onClick={deleteSubscriber} disabled={busy !== null}>
                        {busy === 'delete' ? 'Deleting…' : 'Delete subscriber'}
                    </button>
                </div>
            </DrawerSection>
        </Drawer>
    );
}
