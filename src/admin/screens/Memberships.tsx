import {type FormEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import {Drawer, EmptyState, Field, Notice, PageHeader, Segmented, TableSkeleton} from '../../ui/components';
import {useConfirm} from '../../ui/confirmContext';
import {currentMonth, formatMonth, formatMonthLong} from '../../ui/format';
import {getResponseErrorMessage} from '../../utils/errors';
import {useAdminNav} from '../adminNavContext';
import type {
    MembershipCreateRequest,
    MembershipEndRequest,
    MembershipResponse,
    MembershipUpdateRequest
} from '../../types/membership';
import type {SubscriberResponse} from '../../types/subscriber';
import type {SubscriptionServiceResponse} from '../../types/subscription';
import {getAllMemberships, getJson, getServices, isEnded, sortByName} from './people';
import './Memberships.css';
import SubscriberOptions from './SubscriberOptions';
import {fullName, primeSubscriberNames, useSubscriberNames} from '../subscriberNames';
import {SortHeader} from '../../ui/sorting';
import {useSort} from '../../ui/useSort';

type StateFilter = 'active' | 'ended' | 'all';

interface MembershipForm {
    subscriberId: string;
    serviceId: string;
    startMonth: string;
    endMonth: string;
    shareWeight: string;
}

type FormErrors = Partial<Record<keyof MembershipForm, string>>;

type DrawerMode =
    | { kind: 'create' }
    | { kind: 'edit'; membership: MembershipResponse }
    | { kind: 'end'; membership: MembershipResponse };

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function validate(form: MembershipForm, mode: DrawerMode): FormErrors {
    const errors: FormErrors = {};
    if (mode.kind === 'create') {
        if (!form.subscriberId) errors.subscriberId = 'Choose who joins.';
        if (!form.serviceId) errors.serviceId = 'Choose the service.';
    }
    if (mode.kind !== 'end') {
        if (!MONTH_PATTERN.test(form.startMonth)) errors.startMonth = 'Choose the first month they pay for.';
    }
    if (mode.kind === 'end' && !MONTH_PATTERN.test(form.endMonth)) {
        errors.endMonth = 'Choose the last month they pay for.';
    } else if (form.endMonth && !MONTH_PATTERN.test(form.endMonth)) {
        errors.endMonth = 'Use a month, e.g. 2026-10.';
    }
    if (mode.kind !== 'end' && !/^([1-9]\d?|100)$/.test(form.shareWeight.trim())) {
        errors.shareWeight = 'Use a whole number from 1 to 100.';
    }
    const start = mode.kind === 'end' ? mode.membership.startMonth : form.startMonth;
    if (!errors.endMonth && form.endMonth && start && form.endMonth < start) {
        errors.endMonth = `The end can’t be before the start, ${formatMonth(start)}.`;
    }
    return errors;
}

export default function Memberships() {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();
    const {refreshCounts} = useAdminNav();
    const names = useSubscriberNames();
    const [memberships, setMemberships] = useState<MembershipResponse[]>([]);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [subscriberFilter, setSubscriberFilter] = useState('');
    const [serviceFilter, setServiceFilter] = useState('');
    const [stateFilter, setStateFilter] = useState<StateFilter>('active');
    const [mode, setMode] = useState<DrawerMode | null>(null);
    const [form, setForm] = useState<MembershipForm>({subscriberId: '', serviceId: '', startMonth: '', endMonth: '', shareWeight: '1'});
    const [errors, setErrors] = useState<FormErrors>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const [loadedServices, loadedSubscribers] = await Promise.all([
                getServices(),
                getJson<SubscriberResponse[]>(API_CONFIG.SUBSCRIBERS_URL, 'Could not load subscribers')
            ]);
            setServices(sortByName(loadedServices));
            setSubscribers(sortByName(loadedSubscribers));
            primeSubscriberNames(loadedSubscribers);
            setMemberships(await getAllMemberships(loadedServices));
        } catch (error) {
            showError('Could not load memberships', error instanceof Error ? error.message : undefined);
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        load();
    }, [load]);

    const month = currentMonth();

    const scoped = useMemo(() => memberships.filter((membership) =>
        (!subscriberFilter || membership.subscriberId === subscriberFilter)
        && (!serviceFilter || membership.subscriptionServiceId === serviceFilter)
    ), [memberships, subscriberFilter, serviceFilter]);

    const endedCount = scoped.filter((membership) => isEnded(membership, month)).length;
    const counts: Record<StateFilter, number> = {
        active: scoped.length - endedCount,
        ended: endedCount,
        all: scoped.length
    };

    const rows = useMemo(() => scoped
        .filter((membership) => stateFilter === 'all' || (stateFilter === 'ended') === isEnded(membership, month))
        .sort((a, b) =>
            a.subscriberName.localeCompare(b.subscriberName)
            || a.subscriptionServiceName.localeCompare(b.subscriptionServiceName)
            || a.startMonth.localeCompare(b.startMonth)
        ), [scoped, stateFilter, month]);

    const {sorted, sort, toggle} = useSort(rows, {
        subscriber: (membership: MembershipResponse) => names.full(membership.subscriberId, membership.subscriberName),
        service: (membership: MembershipResponse) => membership.subscriptionServiceName,
        start: (membership: MembershipResponse) => membership.startMonth,
        end: (membership: MembershipResponse) => membership.endMonth ?? '9999-12'
    });

    const openDrawer = (next: DrawerMode) => {
        setMode(next);
        setErrors({});
        setServerError(null);
        if (next.kind === 'create') {
            setForm({subscriberId: subscriberFilter, serviceId: serviceFilter, startMonth: month, endMonth: '', shareWeight: '1'});
        } else {
            const {membership} = next;
            setForm({
                subscriberId: membership.subscriberId,
                serviceId: membership.subscriptionServiceId,
                startMonth: membership.startMonth,
                endMonth: next.kind === 'end'
                    ? (membership.startMonth > month ? membership.startMonth : month)
                    : membership.endMonth ?? '',
                shareWeight: String(membership.shareWeight)
            });
        }
    };

    const closeDrawer = () => {
        if (!saving) setMode(null);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!mode) return;
        const found = validate(form, mode);
        setErrors(found);
        setServerError(null);
        if (Object.keys(found).length > 0) return;

        let url: string;
        let method: string;
        let body: MembershipCreateRequest | MembershipUpdateRequest | MembershipEndRequest;
        if (mode.kind === 'create') {
            url = API_CONFIG.MEMBERSHIPS_URL;
            method = 'POST';
            body = {
                subscriberId: form.subscriberId,
                subscriptionServiceId: form.serviceId,
                startMonth: form.startMonth,
                endMonth: form.endMonth || undefined,
                shareWeight: Number(form.shareWeight)
            };
        } else if (mode.kind === 'edit') {
            url = `${API_CONFIG.MEMBERSHIPS_URL}/${mode.membership.id}`;
            method = 'PUT';
            body = {startMonth: form.startMonth, endMonth: form.endMonth || null, shareWeight: Number(form.shareWeight)};
        } else {
            url = `${API_CONFIG.MEMBERSHIPS_URL}/${mode.membership.id}/end`;
            method = 'POST';
            body = {endMonth: form.endMonth};
        }

        setSaving(true);
        try {
            const response = await apiFetch(url, {
                method,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                setServerError(await getResponseErrorMessage(response, 'Could not save the membership.'));
                return;
            }
            const saved = await response.json() as MembershipResponse;
            const who = `${saved.subscriberName} · ${saved.subscriptionServiceName}`;
            if (mode.kind === 'create') showSuccess('Membership added', who);
            else if (mode.kind === 'edit') showSuccess('Membership updated', who);
            else showSuccess('Membership ended', `${who}, last month ${formatMonth(saved.endMonth)}`);
            setMode(null);
            await load();
            refreshCounts();
        } catch {
            setServerError('Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (membership: MembershipResponse) => {
        const {confirmed} = await confirm({
            title: 'Delete this membership?',
            text: `${membership.subscriberName} on ${membership.subscriptionServiceName}, from ${formatMonth(membership.startMonth)}. `
                + 'To stop future shares and keep the history, end the membership instead.',
            confirmLabel: 'Delete membership',
            tone: 'danger'
        });
        if (!confirmed) return;
        try {
            const response = await apiFetch(`${API_CONFIG.MEMBERSHIPS_URL}/${membership.id}`, {method: 'DELETE'});
            if (!response.ok) {
                showError('Could not delete the membership', await getResponseErrorMessage(response, 'The server refused the delete.'));
                return;
            }
            showSuccess('Membership deleted', `${membership.subscriberName} · ${membership.subscriptionServiceName}`);
            await load();
            refreshCounts();
        } catch {
            showError('Could not delete the membership', 'Could not reach the server.');
        }
    };

    const addButton = (
        <button type="button" className="ui-btn is-primary" onClick={() => openDrawer({kind: 'create'})}>
            Add membership
        </button>
    );

    const drawerTitle = mode?.kind === 'create' ? 'Add membership' : mode?.kind === 'edit' ? 'Edit membership' : 'End membership';
    const submitLabel = mode?.kind === 'create' ? 'Add membership' : mode?.kind === 'edit' ? 'Save membership' : 'End membership';

    return (
        <>
            <PageHeader
                eyebrow="People"
                title="Memberships"
                lead="A member pays a share of every month from the start month through the end month."
                actions={addButton}
            />
            <div className="ui-page-body mem-body">
                <div className="ui-filters">
                    <select
                        className="ui-select is-compact"
                        value={subscriberFilter}
                        onChange={(event) => setSubscriberFilter(event.target.value)}
                        aria-label="Subscriber"
                    >
                        <option value="">All subscribers</option>
                        <SubscriberOptions subscribers={subscribers}/>
                    </select>
                    <select
                        className="ui-select is-compact"
                        value={serviceFilter}
                        onChange={(event) => setServiceFilter(event.target.value)}
                        aria-label="Service"
                    >
                        <option value="">All services</option>
                        {services.map((service) => (
                            <option key={service.id} value={service.id}>{service.name}</option>
                        ))}
                    </select>
                    <Segmented<StateFilter>
                        ariaLabel="Membership state"
                        value={stateFilter}
                        onChange={setStateFilter}
                        options={[
                            {value: 'active', label: 'Active', count: counts.active},
                            {value: 'ended', label: 'Ended', count: counts.ended},
                            {value: 'all', label: 'All', count: counts.all}
                        ]}
                    />
                </div>

                {loading ? (
                    <TableSkeleton columns="1fr 1fr 130px 130px 200px" rows={8}/>
                ) : memberships.length === 0 ? (
                    <EmptyState title="No memberships yet" action={addButton}>
                        A membership puts a subscriber on a service from a start month, so they share its charges.
                    </EmptyState>
                ) : rows.length === 0 ? (
                    <EmptyState title="Nothing matches">Try another subscriber, service or state.</EmptyState>
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table mem-table">
                            <thead>
                            <tr>
                                <SortHeader column="subscriber" label="Subscriber" sort={sort} onSort={toggle}/>
                                <SortHeader column="service" label="Service" sort={sort} onSort={toggle}/>
                                <SortHeader column="start" label="Start" sort={sort} onSort={toggle}/>
                                <SortHeader column="end" label="End" sort={sort} onSort={toggle}/>
                                <th aria-label="Actions"/>
                            </tr>
                            </thead>
                            <tbody>
                            {sorted.map((membership) => {
                                const ended = isEnded(membership, month);
                                const upcoming = membership.startMonth > month;
                                return (
                                    <tr key={membership.id} className={ended ? 'mem-ended' : ''}>
                                        <td className="is-strong">{names.short(membership.subscriberId, membership.subscriberName)}</td>
                                        <td>
                                            {membership.subscriptionServiceName}
                                            {membership.shareWeight !== 1 && <span className="ui-cell-sub">Share ×{membership.shareWeight}</span>}
                                        </td>
                                        <td>
                                            {formatMonth(membership.startMonth)}
                                            {upcoming && <span className="ui-cell-sub">Starts later</span>}
                                        </td>
                                        <td>
                                            {membership.endMonth
                                                ? <span className="mem-end">{formatMonth(membership.endMonth)}</span>
                                                : <span className="mem-ongoing">ongoing</span>}
                                        </td>
                                        <td className="is-actions">
                                            <button type="button" className="ui-link-btn" onClick={() => openDrawer({kind: 'edit', membership})}>
                                                Edit
                                            </button>
                                            {!membership.endMonth && (
                                                <button type="button" className="ui-link-btn" onClick={() => openDrawer({kind: 'end', membership})}>
                                                    End membership
                                                </button>
                                            )}
                                            <button type="button" className="ui-link-btn is-muted" onClick={() => handleDelete(membership)}>
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Drawer
                open={mode !== null}
                title={drawerTitle}
                onClose={closeDrawer}
                footer={(
                    <>
                        <button type="button" className="ui-btn" onClick={closeDrawer} disabled={saving}>Cancel</button>
                        <button
                            type="submit"
                            form="mem-form"
                            className={`ui-btn ${mode?.kind === 'end' ? 'is-dark' : 'is-primary'}`}
                            disabled={saving}
                        >
                            {saving ? 'Saving…' : submitLabel}
                        </button>
                    </>
                )}
            >
                {mode && (
                    <form id="mem-form" className="mem-form" onSubmit={handleSubmit} noValidate>
                        {serverError && <Notice tone="red">{serverError}</Notice>}
                        {mode.kind === 'create' ? (
                            <>
                                <Field label="Subscriber" htmlFor="mem-subscriber" error={errors.subscriberId}>
                                    <select
                                        id="mem-subscriber"
                                        className="ui-select"
                                        value={form.subscriberId}
                                        onChange={(event) => setForm({...form, subscriberId: event.target.value})}
                                    >
                                        <option value="">Choose a subscriber</option>
                                        <SubscriberOptions subscribers={subscribers} label={(subscriber) => `${fullName(subscriber)} (${subscriber.email})`}/>
                                    </select>
                                </Field>
                                <Field label="Service" htmlFor="mem-service" error={errors.serviceId}>
                                    <select
                                        id="mem-service"
                                        className="ui-select"
                                        value={form.serviceId}
                                        onChange={(event) => setForm({...form, serviceId: event.target.value})}
                                    >
                                        <option value="">Choose a service</option>
                                        {services.map((service) => (
                                            <option key={service.id} value={service.id}>{service.name}</option>
                                        ))}
                                    </select>
                                </Field>
                            </>
                        ) : (
                            <div className="mem-who">
                                <span className="mem-who-name">{names.full(mode.membership.subscriberId, mode.membership.subscriberName)}</span>
                                <span className="mem-who-meta">
                                    {mode.membership.subscriptionServiceName} · since {formatMonth(mode.membership.startMonth)}
                                </span>
                            </div>
                        )}

                        {mode.kind !== 'end' && (
                            <Field
                                label="Start month"
                                htmlFor="mem-start"
                                error={errors.startMonth}
                                hint="The first month they share."
                            >
                                <input
                                    id="mem-start"
                                    type="month"
                                    className="ui-input"
                                    value={form.startMonth}
                                    onChange={(event) => setForm({...form, startMonth: event.target.value})}
                                />
                            </Field>
                        )}
                        <Field
                            label="End month"
                            optional={mode.kind !== 'end'}
                            htmlFor="mem-end"
                            error={errors.endMonth}
                            hint={mode.kind === 'end'
                                ? `They share ${form.endMonth ? formatMonthLong(form.endMonth) : 'the month you pick'} and nothing after it.`
                                : 'The last month they share. Leave empty while it is ongoing.'}
                        >
                            <input
                                id="mem-end"
                                type="month"
                                className="ui-input"
                                value={form.endMonth}
                                min={mode.kind === 'end' ? mode.membership.startMonth : form.startMonth || undefined}
                                onChange={(event) => setForm({...form, endMonth: event.target.value})}
                            />
                        </Field>
                        {mode.kind !== 'end' && (
                            <Field
                                label="Share"
                                htmlFor="mem-share"
                                error={errors.shareWeight}
                                hint="Their part relative to the others. Weights 2, 2, 1, 1 split a bill 2/6, 2/6, 1/6, 1/6; 1 for everyone splits it evenly. Bills already calculated keep the split they had."
                            >
                                <input
                                    id="mem-share"
                                    type="number"
                                    min={1}
                                    max={100}
                                    step={1}
                                    className="ui-input"
                                    value={form.shareWeight}
                                    onChange={(event) => setForm({...form, shareWeight: event.target.value})}
                                />
                            </Field>
                        )}
                        {mode.kind === 'edit' && (
                            <span className="mem-note">
                                To move someone to another service, end this membership and add a new one.
                            </span>
                        )}
                    </form>
                )}
            </Drawer>
        </>
    );
}
