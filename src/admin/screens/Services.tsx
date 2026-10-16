import {type FormEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import {Drawer, EmptyState, Field, Notice, PageHeader, TableSkeleton} from '../../ui/components';
import {useConfirm} from '../../ui/confirmContext';
import {currentMonth, formatMoney, plural} from '../../ui/format';
import {getResponseErrorMessage} from '../../utils/errors';
import {useAdminNav} from '../adminNavContext';
import type {MembershipResponse} from '../../types/membership';
import type {SubscriptionServiceCreateRequest, SubscriptionServiceResponse} from '../../types/subscription';
import {activeMemberCounts, getAllMemberships, getServices, parseAmount, sortByName} from './people';
import './Services.css';

interface ServiceForm {
    name: string;
    price: string;
}

type FormErrors = Partial<Record<keyof ServiceForm, string>>;

const EMPTY_FORM: ServiceForm = {name: '', price: ''};

function validate(form: ServiceForm): FormErrors {
    const errors: FormErrors = {};
    if (!form.name.trim()) errors.name = 'Give the service a name.';
    const price = parseAmount(form.price);
    if (!form.price.trim()) errors.price = 'Enter the monthly price.';
    else if (price === null) errors.price = 'Enter a number, e.g. 351,00.';
    else if (price <= 0) errors.price = 'The price must be more than zero.';
    else if (Math.abs(Math.round(price * 100) - price * 100) > 1e-6) errors.price = 'Use at most two decimal places.';
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
    const totalPrice = services.reduce((sum, service) => sum + Number(service.price), 0);
    const totalMembers = services.reduce((sum, service) => sum + (memberCounts.get(service.id) ?? 0), 0);

    const openForm = (service: SubscriptionServiceResponse | null) => {
        setEditing(service);
        setForm(service ? {name: service.name, price: String(service.price).replace('.', ',')} : EMPTY_FORM);
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
            price: parseAmount(form.price) ?? 0
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
                                <th>Service</th>
                                <th className="is-num">Price / month</th>
                                <th className="is-num">Active members</th>
                                <th aria-label="Actions"/>
                            </tr>
                            </thead>
                            <tbody>
                            {services.map((service) => (
                                <tr key={service.id}>
                                    <td className="svc-name">{service.name}</td>
                                    <td className="is-num">{formatMoney(service.price)}</td>
                                    <td className="is-num">{memberCounts.get(service.id) ?? 0}</td>
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
                                <td className="is-num">{formatMoney(totalPrice)}</td>
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
                        hint="The whole bill for the family, in hryvnias."
                    >
                        <input
                            id="svc-price"
                            className="ui-input is-money"
                            inputMode="decimal"
                            value={form.price}
                            onChange={(event) => setForm({...form, price: event.target.value})}
                            placeholder="0,00"
                        />
                    </Field>
                </form>
            </Drawer>
        </>
    );
}
