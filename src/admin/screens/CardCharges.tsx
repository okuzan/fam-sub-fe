import {type FormEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {getResponseErrorMessage} from '../../utils/errors';
import {useToast} from '../../components/ToastContext';
import {useConfirm} from '../../ui/confirmContext';
import {useAdminNav} from '../adminNavContext';
import {EmptyState, PageHeader, TableSkeleton, Tabs, Tag, type Tone} from '../../ui/components';
import {formatInstantDate, formatMoney, formatMonth, formatWhen} from '../../ui/format';
import type {SubscriptionServiceResponse} from '../../types/subscription';
import type {
    BankChargeMatchMethod,
    BankChargesOverview,
    BankDebitResponse,
    BankDebitStatus,
    BankDebitUndoResult,
    BankMerchantRuleCreateRequest,
    BankMerchantRuleResponse
} from '../../types/bankCharge';
import './BankPayments.css';

type TabKey = BankDebitStatus | 'ALL';

const FETCH_LIMIT = 500;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const CURRENCIES = ['USD', 'EUR', 'UAH'];

const MATCH_TAGS: Record<BankChargeMatchMethod, { label: string; tone: Tone }> = {
    RULE: {label: 'Rule', tone: 'green'},
    ADMIN: {label: 'Admin', tone: 'grey'}
};

const SYMBOLS: Record<string, string> = {USD: '$', EUR: '€', UAH: '₴'};

/** "$100.00", "€9.99", or "100.00 PLN" for a currency without a symbol here. */
const formatOriginal = (amount: number, currency: string) => {
    const fixed = Number(amount).toFixed(2);
    return SYMBOLS[currency] ? `${SYMBOLS[currency]}${fixed}` : `${fixed} ${currency}`;
};

const merchantName = (debit: BankDebitResponse) => debit.description ?? debit.merchant;

interface ChargeDraft {
    serviceId: string;
    month: string;
    rememberAmount: boolean;
}

interface RuleForm {
    merchant: string;
    amount: string;
    currency: string;
    /** '' means an ignore rule. */
    serviceId: string;
}

const EMPTY_RULE: RuleForm = {merchant: '', amount: '', currency: 'USD', serviceId: ''};

export default function CardCharges() {
    const {showError, showSuccess} = useToast();
    const confirm = useConfirm();
    const {refreshCounts} = useAdminNav();
    const [tab, setTab] = useState<TabKey>('UNMATCHED');
    const [overview, setOverview] = useState<BankChargesOverview | null>(null);
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [drafts, setDrafts] = useState<Record<string, ChargeDraft>>({});
    const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_RULE);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_CHARGES_URL}?limit=${FETCH_LIMIT}`);
            if (response.ok) {
                setOverview(await response.json());
            } else {
                showError(await getResponseErrorMessage(response, 'Could not load card charges'));
            }
        } catch (err) {
            console.error(err);
            showError('Could not load card charges');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        apiFetch(API_CONFIG.SUBSCRIPTION_SERVICES_URL)
            .then((response) => response.ok ? response.json() : [])
            .then((list: SubscriptionServiceResponse[]) => setServices([...list].sort((a, b) => a.name.localeCompare(b.name))))
            .catch((err) => console.error(err));
    }, []);

    const afterChange = async () => {
        await load();
        refreshCounts();
    };

    const debits = useMemo(() => overview?.debits ?? [], [overview]);
    const rules = overview?.rules ?? [];
    const byStatus = useMemo(() => ({
        UNMATCHED: debits.filter((d) => d.status === 'UNMATCHED'),
        CHARGED: debits.filter((d) => d.status === 'CHARGED'),
        IGNORED: debits.filter((d) => d.status === 'IGNORED')
    }), [debits]);

    const draftFor = (debit: BankDebitResponse): ChargeDraft =>
        drafts[debit.id] ?? {
            serviceId: debit.suggestedServiceId ?? '',
            month: debit.suggestedChargeMonth,
            rememberAmount: true
        };

    const updateDraft = (debit: BankDebitResponse, change: Partial<ChargeDraft>) =>
        setDrafts((current) => ({...current, [debit.id]: {...draftFor(debit), ...change}}));

    const post = async (url: string, body: unknown, failure: string): Promise<Response | null> => {
        try {
            const response = await apiFetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                showError(await getResponseErrorMessage(response, failure));
                return null;
            }
            return response;
        } catch (err) {
            console.error(err);
            showError(failure);
            return null;
        }
    };

    const handleCharge = async (debit: BankDebitResponse) => {
        const draft = draftFor(debit);
        if (!draft.serviceId) {
            showError('Choose which service this bill is for');
            return;
        }
        if (!MONTH_PATTERN.test(draft.month)) {
            showError('Choose the month this bill pays for');
            return;
        }
        setBusyId(debit.id);
        const response = await post(`${API_CONFIG.ADMIN_BANK_CHARGES_URL}/${debit.id}/charge`, {
            subscriptionServiceId: draft.serviceId,
            chargeMonth: draft.month,
            rememberAmount: draft.rememberAmount
        }, 'Could not charge the payment');
        if (response) {
            const result: BankDebitResponse = await response.json();
            showSuccess(
                `Charged ${formatMoney(debit.amount)} to ${result.subscriptionServiceName ?? 'the service'}`,
                [formatMonth(result.chargeMonth), draft.rememberAmount ? `${formatOriginal(debit.originalAmount, debit.currency)} remembered` : null]
                    .filter(Boolean).join(' · ')
            );
            setDrafts((current) => {
                const next = {...current};
                delete next[debit.id];
                return next;
            });
            await afterChange();
        }
        setBusyId(null);
    };

    const handleIgnore = async (debit: BankDebitResponse, rememberAmount: boolean) => {
        const what = `${merchantName(debit)} ${formatOriginal(debit.originalAmount, debit.currency)}`;
        if (rememberAmount) {
            const {confirmed} = await confirm({
                title: `Always ignore ${what}?`,
                text: 'This payment and every later one from this merchant for exactly this amount will be filed as ignored. ' +
                    'Use it for a plan that is yours alone. You can remove the rule below.',
                confirmLabel: 'Always ignore',
                tone: 'dark'
            });
            if (!confirmed) return;
        }
        setBusyId(debit.id);
        const response = await post(`${API_CONFIG.ADMIN_BANK_CHARGES_URL}/${debit.id}/ignore`, {rememberAmount},
            'Could not ignore the payment');
        if (response) {
            showSuccess(rememberAmount ? `Ignoring ${what} from now on` : 'Payment ignored', formatWhen(debit.occurredAt));
            await afterChange();
        }
        setBusyId(null);
    };

    const handleUndo = async (debit: BankDebitResponse) => {
        const {confirmed} = await confirm({
            title: `Take ${formatMoney(debit.amount)} out of ${debit.subscriptionServiceName}?`,
            text: `The ${formatMonth(debit.chargeMonth)} ${debit.subscriptionServiceName} charge goes down by ${formatMoney(debit.amount)}, ` +
                'or is deleted when this payment was all of it. The payment goes back to Needs review.',
            confirmLabel: 'Undo charge',
            tone: 'danger'
        });
        if (!confirmed) return;
        setBusyId(debit.id);
        const response = await post(`${API_CONFIG.ADMIN_BANK_CHARGES_URL}/${debit.id}/undo`, {}, 'Could not undo the charge');
        if (response) {
            const result: BankDebitUndoResult = await response.json();
            showSuccess(
                `Took ${formatMoney(debit.amount)} out of ${debit.subscriptionServiceName}`,
                result.chargeDeleted ? 'Charge deleted' : `Charge now ${formatMoney(result.chargeAmountAfter)}`
            );
            await afterChange();
        }
        setBusyId(null);
    };

    const handleAddRule = async (event: FormEvent) => {
        event.preventDefault();
        const amount = Number(ruleForm.amount.replace(',', '.'));
        if (!ruleForm.merchant.trim() || !(amount > 0)) {
            showError('Enter the merchant and the exact amount it charges');
            return;
        }
        const request: BankMerchantRuleCreateRequest = {
            merchant: ruleForm.merchant.trim(),
            currency: ruleForm.currency,
            amount,
            subscriptionServiceId: ruleForm.serviceId || null
        };
        const response = await post(`${API_CONFIG.ADMIN_BANK_CHARGES_URL}/rules`, request, 'Could not add the rule');
        if (response) {
            showSuccess('Rule added', `${request.merchant} ${formatOriginal(amount, request.currency)}`);
            setRuleForm(EMPTY_RULE);
            await afterChange();
        }
    };

    const handleRemoveRule = async (rule: BankMerchantRuleResponse) => {
        const what = `${rule.merchant} ${formatOriginal(rule.amount, rule.currency)}`;
        const {confirmed} = await confirm({
            title: `Remove the rule for ${what}?`,
            text: 'Its next payment waits here for review. Charges already made stay as they are.',
            confirmLabel: 'Remove rule',
            tone: 'danger'
        });
        if (!confirmed) return;
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_BANK_CHARGES_URL}/rules/${rule.id}`, {method: 'DELETE'});
            if (response.ok) {
                showSuccess('Rule removed', what);
                await afterChange();
            } else {
                showError(await getResponseErrorMessage(response, 'Could not remove the rule'));
            }
        } catch (err) {
            console.error(err);
            showError('Could not remove the rule');
        }
    };

    const tabs = [
        {value: 'UNMATCHED' as const, label: 'Needs review', count: byStatus.UNMATCHED.length},
        {value: 'CHARGED' as const, label: 'Charged', count: byStatus.CHARGED.length},
        {value: 'IGNORED' as const, label: 'Ignored', count: byStatus.IGNORED.length},
        {value: 'ALL' as const, label: 'All', count: debits.length}
    ];

    const renderTabBody = () => {
        if (loading) return <TableSkeleton columns="110px 1fr 110px 110px 1fr 90px" rows={5}/>;
        if (tab === 'UNMATCHED') {
            return byStatus.UNMATCHED.length === 0 ? (
                <EmptyState title="No card payments need review">
                    Bills that match a rule below are added to that month’s charge as they settle.
                </EmptyState>
            ) : (
                <div className="bank-cards">
                    {byStatus.UNMATCHED.map((debit) => (
                        <ReviewCard
                            key={debit.id}
                            debit={debit}
                            draft={draftFor(debit)}
                            services={services}
                            busy={busyId === debit.id}
                            onDraft={(change) => updateDraft(debit, change)}
                            onCharge={() => handleCharge(debit)}
                            onIgnore={(remember) => handleIgnore(debit, remember)}
                        />
                    ))}
                </div>
            );
        }
        const list = tab === 'ALL' ? debits : byStatus[tab];
        if (list.length === 0) {
            return <EmptyState title="Nothing here yet">Card payments to known merchants appear here after the next sync.</EmptyState>;
        }
        return (
            <section className="bank-section">
                <DebitTable list={list} busyId={busyId} onUndo={handleUndo} onOpenTab={setTab}/>
            </section>
        );
    };

    return (
        <div className="bank-page">
            <PageHeader
                eyebrow="Billing"
                title="Card charges"
                lead="Subscription bills paid from the Monobank card, read with every bank sync. A bill whose merchant and exact amount match a rule becomes that month’s charge for the service; one paid on the 25th or later counts for the next month. Anything else waits here."
            />

            <div className="bank-tabs">
                <Tabs options={tabs} value={tab} onChange={setTab} alertValue="UNMATCHED"/>
            </div>

            <div className="bank-body">
                {renderTabBody()}

                <section className="bank-section">
                    <div className="bank-section-head">
                        <h2 className="ui-section-title">Rules</h2>
                        <span className="bank-section-note">Merchant name contains · exact amount charged → service</span>
                    </div>
                    {rules.length > 0 && (
                        <div className="ui-table-wrap">
                            <table className="ui-table bank-senders-table">
                                <thead>
                                <tr>
                                    <th>Merchant</th>
                                    <th className="is-num">Amount</th>
                                    <th>Charged to</th>
                                    <th>Added</th>
                                    <th aria-label="Actions"/>
                                </tr>
                                </thead>
                                <tbody>
                                {rules.map((rule) => (
                                    <tr key={rule.id}>
                                        <td className="bank-strong">{rule.merchant}</td>
                                        <td className="is-num">{formatOriginal(rule.amount, rule.currency)}</td>
                                        <td>
                                            {rule.ignored || !rule.subscriptionServiceName
                                                ? <span className="ui-faint">Ignored</span>
                                                : <span className="is-strong">{rule.subscriptionServiceName}</span>}
                                        </td>
                                        <td className="ui-muted">
                                            {rule.learnedAutomatically ? 'Initial setup' : 'By an admin'}
                                            {' · '}{formatInstantDate(rule.createdAt)}
                                        </td>
                                        <td className="is-actions">
                                            <button type="button" className="ui-link-btn is-muted bank-forget"
                                                    onClick={() => handleRemoveRule(rule)}>
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <form className="bank-card-row bank-card-actions" onSubmit={handleAddRule}>
                        <input
                            aria-label="Merchant"
                            className="ui-input"
                            placeholder="Merchant, e.g. Claude"
                            value={ruleForm.merchant}
                            onChange={(event) => setRuleForm({...ruleForm, merchant: event.target.value})}
                        />
                        <input
                            aria-label="Exact amount"
                            className="ui-input is-money"
                            inputMode="decimal"
                            placeholder="100.00"
                            value={ruleForm.amount}
                            onChange={(event) => setRuleForm({...ruleForm, amount: event.target.value})}
                        />
                        <select
                            aria-label="Currency"
                            className="ui-select"
                            value={ruleForm.currency}
                            onChange={(event) => setRuleForm({...ruleForm, currency: event.target.value})}
                        >
                            {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </select>
                        <select
                            aria-label="Service"
                            className="ui-select"
                            value={ruleForm.serviceId}
                            onChange={(event) => setRuleForm({...ruleForm, serviceId: event.target.value})}
                        >
                            <option value="">Ignore (not a FamSub bill)</option>
                            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                        </select>
                        <button type="submit" className="ui-btn">Add rule</button>
                    </form>
                </section>
            </div>
        </div>
    );
}

interface ReviewCardProps {
    debit: BankDebitResponse;
    draft: ChargeDraft;
    services: SubscriptionServiceResponse[];
    busy: boolean;
    onDraft: (change: Partial<ChargeDraft>) => void;
    onCharge: () => void;
    onIgnore: (rememberAmount: boolean) => void;
}

function ReviewCard({debit, draft, services, busy, onDraft, onCharge, onIgnore}: ReviewCardProps) {
    const original = formatOriginal(debit.originalAmount, debit.currency);
    return (
        <article className="bank-card">
            <div className="bank-card-top">
                <span className="bank-card-amount">{original}</span>
                <div className="bank-card-who">
                    <span className="bank-card-sender">{merchantName(debit)}</span>
                    {debit.currency !== 'UAH' && <span className="bank-card-purpose">{formatMoney(debit.amount)} from the card</span>}
                </div>
                <span className="bank-card-when">{formatWhen(debit.occurredAt)}</span>
            </div>

            {debit.reviewNote && <p className="bank-card-row bank-card-note">{debit.reviewNote}</p>}

            <div className="bank-card-row bank-card-actions">
                <select
                    aria-label="Service"
                    className={`ui-select bank-select ${draft.serviceId ? '' : 'is-empty'}`}
                    value={draft.serviceId}
                    onChange={(event) => onDraft({serviceId: event.target.value})}
                    disabled={busy}
                >
                    <option value="">Choose service</option>
                    {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
                <input
                    aria-label="Month it pays for"
                    type="month"
                    className="ui-input"
                    value={draft.month}
                    onChange={(event) => onDraft({month: event.target.value})}
                    disabled={busy}
                />
                <button type="button" className="ui-btn is-primary bank-apply" onClick={onCharge}
                        disabled={busy || !draft.serviceId}>
                    {busy ? 'Charging…' : 'Charge'}
                </button>
                <label className="ui-checkbox bank-remember">
                    <input
                        type="checkbox"
                        checked={draft.rememberAmount}
                        onChange={(event) => onDraft({rememberAmount: event.target.checked})}
                        disabled={busy}
                    />
                    Charge {original} from {debit.merchant} automatically next time
                </label>
                <div className="bank-card-links">
                    <button type="button" className="ui-link-btn is-muted" onClick={() => onIgnore(false)} disabled={busy}>
                        Not a FamSub bill
                    </button>
                    <button type="button" className="ui-link-btn is-muted" onClick={() => onIgnore(true)} disabled={busy}>
                        Always ignore {original}
                    </button>
                </div>
            </div>
        </article>
    );
}

function DebitTable({list, busyId, onUndo, onOpenTab}: {
    list: BankDebitResponse[];
    busyId: string | null;
    onUndo: (debit: BankDebitResponse) => void;
    onOpenTab: (tab: TabKey) => void;
}) {
    return (
        <div className="ui-table-wrap">
            <table className="ui-table bank-table">
                <thead>
                <tr>
                    <th>Time</th>
                    <th>Merchant</th>
                    <th className="is-num">Charged</th>
                    <th className="is-num">From card</th>
                    <th>Went to</th>
                    <th className="bank-col-end">Matched by</th>
                    <th aria-label="Actions"/>
                </tr>
                </thead>
                <tbody>
                {list.map((debit) => {
                    const open = debit.status === 'UNMATCHED' ? () => onOpenTab('UNMATCHED') : undefined;
                    return (
                        <tr key={debit.id} className={open ? 'is-clickable' : ''} onClick={open}>
                            <td className="bank-mono-cell">{formatWhen(debit.occurredAt)}</td>
                            <td className="bank-strong">{merchantName(debit)}</td>
                            <td className="is-num">{formatOriginal(debit.originalAmount, debit.currency)}</td>
                            <td className="is-num">{formatMoney(debit.amount)}</td>
                            <td>
                                {debit.status === 'CHARGED'
                                    ? <><strong className="is-strong">{debit.subscriptionServiceName}</strong> · {formatMonth(debit.chargeMonth)}</>
                                    : <span className="ui-faint">—</span>}
                            </td>
                            <td className="bank-col-end">
                                {debit.status === 'UNMATCHED' && <Tag tone="red">Needs review</Tag>}
                                {debit.status === 'IGNORED' && <Tag tone="grey">Ignored</Tag>}
                                {debit.status === 'CHARGED' && debit.matchMethod && (
                                    <Tag tone={MATCH_TAGS[debit.matchMethod].tone}>{MATCH_TAGS[debit.matchMethod].label}</Tag>
                                )}
                            </td>
                            <td className="bank-col-end">
                                {debit.status === 'CHARGED' && (
                                    <button type="button" className="ui-link-btn is-muted"
                                            disabled={busyId === debit.id}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onUndo(debit);
                                            }}>
                                        Undo
                                    </button>
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
