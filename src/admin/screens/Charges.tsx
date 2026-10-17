import {useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import type {ChargeCreateRequest, ChargeResponse, ChargeUpdateRequest} from '../../types/charge';
import type {SubscriptionServiceResponse} from '../../types/subscription';
import {Drawer, EmptyState, Field, Notice, PageHeader, TableSkeleton} from '../../ui/components';
import {useConfirm} from '../../ui/confirmContext';
import {currentMonth, formatAmount, formatMoney, formatMonth, formatMonthLong, plural} from '../../ui/format';
import {getResponseErrorMessage} from '../../utils/errors';
import {errorMessage, fetchAllCharges, fetchServices, isChargeCalculated} from './chargeData';
import './Charges.css';
import {SortHeader} from '../../ui/sorting';
import {useSort} from '../../ui/useSort';

const PAGE_SIZE = 10;

interface ChargeForm {
    serviceId: string;
    month: string;
    amount: string;
    notes: string;
}

type FieldName = keyof ChargeForm;
type ServerErrors = Partial<Record<FieldName | 'form', string>>;

const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;

/** "1 240,50" or "1240.5" → 1240.5. */
const normaliseAmount = (value: string) => value.trim().replace(/\s/g, '');
const parseAmount = (value: string) => Number(normaliseAmount(value).replace(',', '.'));
/** A price as the amount input shows it: "510,00", no grouping. */
const amountInput = (value: number) => normaliseAmount(formatAmount(value));

export default function Charges() {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [charges, setCharges] = useState<ChargeResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [serviceFilter, setServiceFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [page, setPage] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<ChargeResponse | null>(null);

    const load = useCallback(async () => {
        try {
            const nextServices = await fetchServices();
            setServices(nextServices);
            setCharges(await fetchAllCharges(nextServices));
        } catch (error) {
            showError("Couldn't load charges", errorMessage(error, 'Try again in a moment.'));
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        void load();
    }, [load]);

    const months = useMemo(
        () => Array.from(new Set(charges.map((charge) => charge.chargeMonth))).sort().reverse(),
        [charges]
    );

    const filtered = useMemo(
        () => charges.filter((charge) =>
            (!serviceFilter || charge.subscriptionServiceId === serviceFilter)
            && (!monthFilter || charge.chargeMonth === monthFilter)
        ),
        [charges, serviceFilter, monthFilter]
    );

    const {sorted, sort, toggle} = useSort(filtered, {
        service: (charge: ChargeResponse) => charge.subscriptionServiceName,
        month: (charge: ChargeResponse) => charge.chargeMonth,
        amount: (charge: ChargeResponse) => Number(charge.amount)
    });
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const visible = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
    const hasFilters = Boolean(serviceFilter || monthFilter);

    const clearFilters = () => {
        setServiceFilter('');
        setMonthFilter('');
        setPage(0);
    };

    const openCreate = () => {
        setEditing(null);
        setDrawerOpen(true);
    };

    const openEdit = (charge: ChargeResponse) => {
        setEditing(charge);
        setDrawerOpen(true);
    };

    const closeDrawer = () => {
        setDrawerOpen(false);
        setEditing(null);
    };

    const handleSaved = (saved: ChargeResponse, created: boolean) => {
        closeDrawer();
        showSuccess(
            created ? 'Charge added' : 'Charge updated',
            `${saved.subscriptionServiceName} · ${formatMonth(saved.chargeMonth)} · ${formatMoney(saved.amount)}`
        );
        void load();
    };

    const handleDelete = async (charge: ChargeResponse) => {
        const label = `${charge.subscriptionServiceName} · ${formatMonth(charge.chargeMonth)}`;
        if (await isChargeCalculated(charge.id)) {
            showError(`Can't delete ${label}`, 'A cost calculation already split it. Undo that run on the Ledger first.');
            return;
        }
        const {confirmed} = await confirm({
            title: `Delete the ${label} charge?`,
            text: `The ${formatMoney(charge.amount)} bill is removed. No cost calculation has used it yet, so nothing else changes.`,
            confirmLabel: 'Delete charge',
            tone: 'danger'
        });
        if (!confirmed) return;
        try {
            const response = await apiFetch(`${API_CONFIG.CHARGES_URL}/${charge.id}`, {method: 'DELETE'});
            if (!response.ok) {
                showError(`Couldn't delete ${label}`, await getResponseErrorMessage(response, 'Try again in a moment.'));
                return;
            }
            showSuccess('Charge deleted', `${label} · ${formatMoney(charge.amount)}`);
            void load();
        } catch {
            showError(`Couldn't delete ${label}`, 'The server could not be reached.');
        }
    };

    return (
        <>
            <PageHeader
                eyebrow="Billing"
                title="Charges"
                lead="One real bill per service per month. A cost calculation splits it across that month’s members."
                actions={
                    <button type="button" className="ui-btn is-primary" onClick={openCreate}
                            disabled={loading || services.length === 0}>
                        Add charge
                    </button>
                }
            />
            <div className="chg-filters ui-filters">
                <select className="ui-select is-compact" aria-label="Service" value={serviceFilter}
                        onChange={(event) => {
                            setServiceFilter(event.target.value);
                            setPage(0);
                        }}>
                    <option value="">All services</option>
                    {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
                <select className="ui-select is-compact" aria-label="Month" value={monthFilter}
                        onChange={(event) => {
                            setMonthFilter(event.target.value);
                            setPage(0);
                        }}>
                    <option value="">All months</option>
                    {months.map((month) => <option key={month} value={month}>{formatMonthLong(month)}</option>)}
                </select>
                {!loading && (
                    <span className="ui-filter-note">{visible.length} of {plural(filtered.length, 'charge')}</span>
                )}
            </div>
            <div className="chg-body">
                {loading ? (
                    <TableSkeleton columns="0.8fr 120px 110px 1.3fr 100px" rows={8}/>
                ) : filtered.length === 0 ? (
                    hasFilters ? (
                        <EmptyState
                            title="No charges match these filters"
                            action={<button type="button" className="ui-btn" onClick={clearFilters}>Clear filters</button>}
                        >
                            {[
                                services.find((service) => service.id === serviceFilter)?.name,
                                monthFilter && formatMonthLong(monthFilter)
                            ].filter(Boolean).join(' · ')}
                        </EmptyState>
                    ) : (
                        <EmptyState
                            title="No charges yet"
                            action={services.length > 0 && (
                                <button type="button" className="ui-btn is-primary" onClick={openCreate}>Add charge</button>
                            )}
                        >
                            {services.length === 0
                                ? 'Add a service first. Each charge is one month’s bill for one service.'
                                : 'Add the first bill. A cost calculation then splits it across that month’s members.'}
                        </EmptyState>
                    )
                ) : (
                    <>
                        <div className="ui-table-wrap">
                            <table className="ui-table chg-table">
                                <thead>
                                <tr>
                                    <SortHeader column="service" label="Service" sort={sort} onSort={toggle}/>
                                    <SortHeader column="month" label="Month" sort={sort} onSort={toggle}/>
                                    <SortHeader column="amount" label="Amount" sort={sort} onSort={toggle} className="is-num"/>
                                    <th>Notes</th>
                                    <th><span className="chg-sr">Actions</span></th>
                                </tr>
                                </thead>
                                <tbody>
                                {visible.map((charge) => (
                                    <tr key={charge.id}>
                                        <td className="is-strong chg-service">{charge.subscriptionServiceName}</td>
                                        <td className="chg-month">{formatMonth(charge.chargeMonth)}</td>
                                        <td className="is-num chg-amount">{formatMoney(charge.amount)}</td>
                                        <td className={`chg-notes ${charge.description ? '' : 'is-empty'}`}>
                                            {charge.description || '—'}
                                        </td>
                                        <td className="is-actions">
                                            <button type="button" className="ui-link-btn" onClick={() => openEdit(charge)}>
                                                Edit
                                            </button>
                                            <button type="button" className="ui-link-btn is-muted"
                                                    onClick={() => void handleDelete(charge)}>
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <nav className="ui-table-footer" aria-label="Charges pages">
                                <span>Page {safePage + 1} of {totalPages}</span>
                                <span className="chg-pager">
                                    <button type="button" className="ui-btn is-small" disabled={safePage === 0}
                                            onClick={() => setPage(safePage - 1)}>Previous</button>
                                    <button type="button" className="ui-btn is-small" disabled={safePage + 1 >= totalPages}
                                            onClick={() => setPage(safePage + 1)}>Next</button>
                                </span>
                            </nav>
                        )}
                    </>
                )}
            </div>
            {drawerOpen && (
                <ChargeDrawer
                    key={editing?.id ?? 'new'}
                    charge={editing}
                    services={services}
                    charges={charges}
                    defaultServiceId={serviceFilter}
                    defaultMonth={monthFilter || currentMonth()}
                    onClose={closeDrawer}
                    onSaved={handleSaved}
                />
            )}
        </>
    );
}

interface ChargeDrawerProps {
    charge: ChargeResponse | null;
    services: SubscriptionServiceResponse[];
    charges: ChargeResponse[];
    defaultServiceId: string;
    defaultMonth: string;
    onClose: () => void;
    onSaved: (charge: ChargeResponse, created: boolean) => void;
}

function ChargeDrawer({charge, services, charges, defaultServiceId, defaultMonth, onClose, onSaved}: ChargeDrawerProps) {
    /** The service's latest bill in hryvnias, or its price when that is in hryvnias and it was never billed. */
    const lastBillInput = (serviceId: string) => {
        const latest = charges
            .filter((existing) => existing.subscriptionServiceId === serviceId)
            .sort((a, b) => b.chargeMonth.localeCompare(a.chargeMonth))[0];
        if (latest) return amountInput(latest.amount);
        const service = services.find((candidate) => candidate.id === serviceId);
        return service?.currency === 'UAH' ? amountInput(service.price) : '';
    };
    const [form, setForm] = useState<ChargeForm>(() => {
        if (charge) {
            return {
                serviceId: charge.subscriptionServiceId,
                month: charge.chargeMonth,
                amount: amountInput(charge.amount),
                notes: charge.description ?? ''
            };
        }
        return {
            serviceId: defaultServiceId,
            month: defaultMonth,
            amount: lastBillInput(defaultServiceId),
            notes: ''
        };
    });
    const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
    const [serverErrors, setServerErrors] = useState<ServerErrors>({});
    const [saving, setSaving] = useState(false);
    const [locked, setLocked] = useState(false);

    useEffect(() => {
        if (!charge) return;
        let active = true;
        void isChargeCalculated(charge.id).then((calculated) => {
            if (active) setLocked(calculated);
        });
        return () => {
            active = false;
        };
    }, [charge]);

    const serviceName = services.find((service) => service.id === form.serviceId)?.name ?? 'This service';
    const duplicateMessage = `${serviceName} already has a charge for ${formatMonthLong(form.month)}. Edit that one instead.`;
    const duplicate = !charge && Boolean(form.serviceId && form.month) && charges.some((existing) =>
        existing.subscriptionServiceId === form.serviceId && existing.chargeMonth === form.month
    );

    const amountText = normaliseAmount(form.amount);
    const errors: Partial<Record<FieldName, string>> = {};
    if (!form.serviceId) errors.serviceId = 'Choose the service this bill is for.';
    if (!form.month) errors.month = 'Choose the month the bill is for.';
    else if (duplicate) errors.month = duplicateMessage;
    if (!amountText) errors.amount = 'Enter the amount of the bill.';
    else if (!AMOUNT_PATTERN.test(amountText)) errors.amount = 'Use a number with at most two decimals, like 510,00.';
    else if (parseAmount(amountText) <= 0) errors.amount = 'The amount must be more than zero.';
    const invalid = Object.keys(errors).length > 0;

    // A clash with an existing charge shows at once; a missing value only once the field was touched.
    const shownError = (field: FieldName) =>
        serverErrors[field] ?? (touched[field] || (field === 'month' && duplicate) ? errors[field] : undefined);

    const update = (field: FieldName, value: string) => {
        setForm((current) => {
            const next = {...current, [field]: value};
            // A new charge usually costs what the last one did: prefill until the admin types an amount.
            if (field === 'serviceId' && !charge && !touched.amount) {
                next.amount = lastBillInput(value);
            }
            return next;
        });
        setTouched((current) => ({...current, [field]: true}));
        setServerErrors((current) => ({...current, [field]: undefined, form: undefined}));
    };

    const save = async () => {
        setTouched({serviceId: true, month: true, amount: true, notes: true});
        if (invalid || saving || locked) return;
        setSaving(true);
        setServerErrors({});
        const amount = parseAmount(amountText);
        const description = form.notes.trim() || undefined;
        try {
            const response = charge
                ? await apiFetch(`${API_CONFIG.CHARGES_URL}/${charge.id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({amount, description} satisfies ChargeUpdateRequest)
                })
                : await apiFetch(API_CONFIG.CHARGES_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        subscriptionServiceId: form.serviceId,
                        chargeMonth: form.month,
                        amount,
                        description
                    } satisfies ChargeCreateRequest)
                });
            if (!response.ok) {
                const message = await getResponseErrorMessage(response, "Couldn't save the charge.");
                if (/already exists/i.test(message)) setServerErrors({month: duplicateMessage});
                else if (/locked/i.test(message)) setLocked(true);
                else if (/amount/i.test(message)) setServerErrors({amount: message});
                else setServerErrors({form: message});
                return;
            }
            onSaved(await response.json(), !charge);
        } catch {
            setServerErrors({form: 'The server could not be reached. Try again in a moment.'});
        } finally {
            setSaving(false);
        }
    };

    return (
        <Drawer
            open
            title={charge ? 'Edit charge' : 'Add charge'}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
                    <button type="submit" form="chg-form" className="ui-btn is-primary"
                            disabled={invalid || saving || locked}>
                        {saving ? 'Saving…' : 'Save charge'}
                    </button>
                </>
            }
        >
            <form id="chg-form" className="chg-form" noValidate onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}>
                {locked && (
                    <Notice tone="clay">
                        A cost calculation already split this charge, so it can’t change. Undo that run on the
                        Ledger first.
                    </Notice>
                )}
                {serverErrors.form && <Notice tone="red">{serverErrors.form}</Notice>}
                <Field label="Service" htmlFor="chg-service" error={shownError('serviceId')}
                       hint={charge ? 'Service and month are fixed. Delete the charge to move it.' : undefined}>
                    <select id="chg-service" className="ui-select" value={form.serviceId} disabled={Boolean(charge)}
                            onChange={(event) => update('serviceId', event.target.value)}>
                        <option value="">Choose a service</option>
                        {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                    </select>
                </Field>
                <Field label="Month" htmlFor="chg-month" error={shownError('month')}>
                    <input id="chg-month" type="month" className="ui-input" value={form.month} disabled={Boolean(charge)}
                           onChange={(event) => update('month', event.target.value)}/>
                </Field>
                <Field label="Amount" htmlFor="chg-amount" error={shownError('amount')}
                       hint="The bill as charged, for the whole family.">
                    <div className="chg-money">
                        <input id="chg-amount" className="ui-input is-money" inputMode="decimal" autoComplete="off"
                               placeholder="0,00" value={form.amount} disabled={locked}
                               onChange={(event) => update('amount', event.target.value)}/>
                        <span className="chg-money-sign" aria-hidden="true">₴</span>
                    </div>
                </Field>
                <Field label="Notes" optional htmlFor="chg-notes">
                    <textarea id="chg-notes" className="ui-textarea" placeholder="e.g. price change, paid in USD"
                              value={form.notes} disabled={locked}
                              onChange={(event) => update('notes', event.target.value)}/>
                </Field>
            </form>
        </Drawer>
    );
}
