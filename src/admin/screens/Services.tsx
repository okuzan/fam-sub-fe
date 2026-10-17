import {type FormEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import {Drawer, EmptyState, Field, Notice, PageHeader, TableSkeleton} from '../../ui/components';
import {useConfirm} from '../../ui/confirmContext';
import {currentMonth, formatPrice, plural} from '../../ui/format';
import {getResponseErrorMessage} from '../../utils/errors';
import {useAdminNav} from '../adminNavContext';
import type {MembershipResponse} from '../../types/membership';
import type {SubscriptionServiceCreateRequest, SubscriptionServiceResponse} from '../../types/subscription';
import {activeMemberCounts, getAllMemberships, getServices, parseAmount, sortByName} from './people';
import './Services.css';
import {SortHeader} from '../../ui/sorting';
import {useSort} from '../../ui/useSort';

interface ServiceForm {
    name: string;
    price: string;
    currency: string;
    /** Empty for a shared account. */
    seats: string;
    fixedMonthlyCharge: boolean;
}

type FormErrors = Partial<Record<keyof ServiceForm, string>>;

const EMPTY_FORM: ServiceForm = {name: '', price: '', currency: 'USD', seats: '', fixedMonthlyCharge: false};
const CURRENCIES = ['USD', 'EUR', 'UAH'];

/** Prices in different currencies don't add up; "$307.99 + €9.99 + ₴897,00". */
const totalByCurrency = (services: SubscriptionServiceResponse[]) => {
    const cents = new Map<string, number>();
    for (const service of services) {
        cents.set(service.currency, (cents.get(service.currency) ?? 0) + Math.round(Number(service.price) * 100));
    }
    return [...cents.entries()]
        .sort(([a], [b]) => CURRENCIES.indexOf(a) - CURRENCIES.indexOf(b))
        .map(([currency, total]) => formatPrice(total / 100, currency))
        .join(' + ');
};

function validate(form: ServiceForm): FormErrors {
    const errors: FormErrors = {};
    if (!form.name.trim()) errors.name = 'Give the service a name.';
    const price = parseAmount(form.price);
    if (!form.price.trim()) errors.price = 'Enter the monthly price.';
    else if (price === null) errors.price = 'Enter a number, e.g. 351,00.';
    else if (price <= 0) errors.price = 'The price must be more than zero.';
    else if (Math.abs(Math.round(price * 100) - price * 100) > 1e-6) errors.price = 'Use at most two decimal places.';
    if (form.seats.trim() && !/^([1-9]\d?|100)$/.test(form.seats.trim())) {
        errors.seats = 'Use a whole number from 1 to 100, or leave it empty.';
    }
    if (form.fixedMonthlyCharge && form.currency !== 'UAH') {
        errors.fixedMonthlyCharge = 'Only a price in hryvnias can be charged on its own.';
    }
    return errors;
}

export default function Services() {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();
    const {refreshCounts} = useAdminNav();
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [memberships, setMemberships] = useState<MembershipResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<SubscriptionServiceResponse | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
    const [errors, setErrors] = useState<FormErrors>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const loaded = await getServices();
            setServices(sortByName(loaded));
            setMemberships(await getAllMemberships(loaded));
        } catch (error) {
            showError('Could not load services', error instanceof Error ? error.message : undefined);
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        load();
    }, [load]);

    const memberCounts = useMemo(() => activeMemberCounts(memberships, currentMonth()), [memberships]);
    const {sorted, sort, toggle} = useSort(services, {
        name: (service: SubscriptionServiceResponse) => service.name,
        price: (service: SubscriptionServiceResponse) => Number(service.price),
        members: (service: SubscriptionServiceResponse) => memberCounts.get(service.id) ?? 0
    });
    const totalMembers = services.reduce((sum, service) => sum + (memberCounts.get(service.id) ?? 0), 0);

    const openForm = (service: SubscriptionServiceResponse | null) => {
        setEditing(service);
        setForm(service
            ? {
                name: service.name,
                price: String(service.price).replace('.', ','),
                currency: service.currency,
                seats: service.seats ? String(service.seats) : '',
                fixedMonthlyCharge: service.fixedMonthlyCharge
            }
            : EMPTY_FORM);
        setErrors({});
        setServerError(null);
        setFormOpen(true);
    };

    const closeForm = () => {
        if (saving) return;
        setFormOpen(false);
        setEditing(null);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const found = validate(form);
        setErrors(found);
        setServerError(null);
        if (Object.keys(found).length > 0) return;

        const request: SubscriptionServiceCreateRequest = {
            name: form.name.trim(),
            price: parseAmount(form.price) ?? 0,
            currency: form.currency,
            seats: form.seats.trim() ? Number(form.seats.trim()) : null,
            fixedMonthlyCharge: form.fixedMonthlyCharge
        };
        setSaving(true);
        try {
            const response = await apiFetch(
                editing ? `${API_CONFIG.SUBSCRIPTION_SERVICES_URL}/${editing.id}` : API_CONFIG.SUBSCRIPTION_SERVICES_URL,
                {
                    method: editing ? 'PUT' : 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(request)
                }
            );
            if (!response.ok) {
                setServerError(await getResponseErrorMessage(response, 'Could not save the service.'));
                return;
            }
            showSuccess(editing ? 'Service updated' : 'Service added', request.name);
            setFormOpen(false);
            setEditing(null);
            await load();
            refreshCounts();
        } catch {
            setServerError('Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (service: SubscriptionServiceResponse) => {
        const members = memberCounts.get(service.id) ?? 0;
        const {confirmed} = await confirm({
            title: `Delete ${service.name}?`,
            text: members > 0
                ? `${plural(members, 'member')} share it this month. A service with memberships or charges can’t be deleted.`
                : 'A service with memberships or charges can’t be deleted.',
            confirmLabel: 'Delete service',
            tone: 'danger'
        });
        if (!confirmed) return;
        try {
            const response = await apiFetch(`${API_CONFIG.SUBSCRIPTION_SERVICES_URL}/${service.id}`, {method: 'DELETE'});
            if (!response.ok) {
                showError(
                    `Could not delete ${service.name}`,
                    await getResponseErrorMessage(response, 'The server refused the delete.')
                );
                return;
            }
            showSuccess('Service deleted', service.name);
            await load();
            refreshCounts();
        } catch {
            showError('Could not delete the service', 'Could not reach the server.');
        }
    };

    const addButton = (
        <button type="button" className="ui-btn is-primary" onClick={() => openForm(null)}>Add service</button>
    );

    return (
        <>
            <PageHeader eyebrow="People" title="Services" actions={addButton}/>
            <div className="ui-page-body svc-body">
                {loading ? (
                    <TableSkeleton columns="1fr 150px 150px 130px" rows={5}/>
                ) : services.length === 0 ? (
                    <EmptyState title="No services yet" action={addButton}>
                        Add the subscriptions the family shares, with their monthly price.
                    </EmptyState>
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table svc-table">
                            <thead>
                            <tr>
                                <SortHeader column="name" label="Service" sort={sort} onSort={toggle}/>
                                <SortHeader column="price" label="Price / month" sort={sort} onSort={toggle} className="is-num"/>
                                <SortHeader column="members" label="Members" sort={sort} onSort={toggle} className="is-num"/>
                                <th aria-label="Actions"/>
                            </tr>
                            </thead>
                            <tbody>
                            {sorted.map((service) => (
                                <tr key={service.id}>
                                    <td className="svc-name">
                                        {service.name}
                                        {service.fixedMonthlyCharge && <span className="ui-cell-sub">Charged monthly at this price</span>}
                                    </td>
                                    <td className="is-num">
                                        {formatPrice(service.price, service.currency)}
                                        {service.seats && (
                                            <span className="ui-cell-sub">
                                                {formatPrice(Math.round(Number(service.price) * 100 / service.seats) / 100, service.currency)} per seat
                                            </span>
                                        )}
                                    </td>
                                    <td className="is-num">
                                        <SeatUsage members={memberCounts.get(service.id) ?? 0} seats={service.seats}/>
                                    </td>
                                    <td className="is-actions">
                                        <button type="button" className="ui-link-btn" onClick={() => openForm(service)}>Edit</button>
                                        <button type="button" className="ui-link-btn is-muted" onClick={() => handleDelete(service)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                            <tfoot>
                            <tr>
                                <td className="svc-total-label">{plural(services.length, 'service')}</td>
                                <td className="is-num">{totalByCurrency(services)}</td>
                                <td className="is-num">{totalMembers}</td>
                                <td/>
                            </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            <Drawer
                open={formOpen}
                title={editing ? 'Edit service' : 'Add service'}
                onClose={closeForm}
                footer={(
                    <>
                        <button type="button" className="ui-btn" onClick={closeForm} disabled={saving}>Cancel</button>
                        <button type="submit" form="svc-form" className="ui-btn is-primary" disabled={saving}>
                            {saving ? 'Saving…' : editing ? 'Save service' : 'Add service'}
                        </button>
                    </>
                )}
            >
                <form id="svc-form" className="svc-form" onSubmit={handleSubmit} noValidate>
                    {serverError && <Notice tone="red">{serverError}</Notice>}
                    <Field label="Name" htmlFor="svc-name" error={errors.name}>
                        <input
                            id="svc-name"
                            className="ui-input"
                            value={form.name}
                            onChange={(event) => setForm({...form, name: event.target.value})}
                            placeholder="e.g. Netflix"
                            autoFocus
                        />
                    </Field>
                    <Field
                        label="Price per month"
                        htmlFor="svc-price"
                        error={errors.price}
                        hint="The plan price as the service states it, e.g. $7.99. What it costs in hryvnias comes from the card each month."
                    >
                        <div className="svc-price-row">
                            <input
                                id="svc-price"
                                className="ui-input is-money"
                                inputMode="decimal"
                                value={form.price}
                                onChange={(event) => setForm({...form, price: event.target.value})}
                                placeholder="0,00"
                            />
                            <select
                                aria-label="Currency"
                                className="ui-select"
                                value={form.currency}
                                onChange={(event) => setForm({
                                    ...form,
                                    currency: event.target.value,
                                    fixedMonthlyCharge: event.target.value === 'UAH' && form.fixedMonthlyCharge
                                })}
                            >
                                {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                            </select>
                        </div>
                    </Field>
                    <Field
                        label="Seats"
                        optional
                        htmlFor="svc-seats"
                        error={errors.seats}
                        hint="For a family plan, how many people it can hold (Spotify Family: 6). Leave empty for an account that is simply shared, like ChatGPT. Members still split the whole bill, empty seats included."
                    >
                        <input
                            id="svc-seats"
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            className="ui-input"
                            value={form.seats}
                            onChange={(event) => setForm({...form, seats: event.target.value})}
                        />
                    </Field>
                    <label className="ui-checkbox">
                        <input
                            type="checkbox"
                            checked={form.fixedMonthlyCharge}
                            disabled={form.currency !== 'UAH'}
                            onChange={(event) => setForm({...form, fixedMonthlyCharge: event.target.checked})}
                        />
                        Charge this price on its own every month
                    </label>
                    {errors.fixedMonthlyCharge && <Notice tone="red">{errors.fixedMonthlyCharge}</Notice>}
                    <span className="ui-muted">
                        Only for a price in hryvnias that the card rules don’t catch, like YouTube through Google.
                        A month that already has a charge is left alone.
                    </span>
                </form>
            </Drawer>
        </>
    );
}

/** "6 of 6 seats", "14 of 18 seats" with the free ones called out, or a plain count for a shared account. */
function SeatUsage({members, seats}: { members: number; seats: number | null }) {
    if (!seats) return <>{members}</>;
    const free = seats - members;
    return (
        <>
            {members} of {seats}
            <span className="ui-cell-sub">
                {free > 0 ? `${plural(free, 'seat')} free` : free === 0 ? 'Full' : `${plural(-free, 'member')} over`}
            </span>
        </>
    );
}
