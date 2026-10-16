import {useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import {EmptyState, PageHeader, Segmented, TableSkeleton, Tag, type Tone} from '../../ui/components';
import {currentMonth, formatMoney} from '../../ui/format';
import {useAdminNav} from '../adminNavContext';
import type {FinanceSummary} from '../../types/finance';
import type {MembershipResponse} from '../../types/membership';
import type {SubscriberResponse} from '../../types/subscriber';
import type {SubscriptionServiceResponse} from '../../types/subscription';
import {activeMemberCounts, getAllMemberships, getJson, getServices, isActiveIn, sortByName} from './people';
import SubscriberDetailDrawer from './SubscriberDetailDrawer';
import SubscriberFormDrawer from './SubscriberFormDrawer';
import './Subscribers.css';

type Filter = 'everyone' | 'owes' | 'credit' | 'exempt';

interface Row {
    subscriber: SubscriberResponse;
    services: string[];
    owes: number;
    status: { label: string; tone: Tone };
}

const statusOf = (subscriber: SubscriberResponse, owes: number): Row['status'] => {
    if (subscriber.billingExempt) return {label: 'Exempt', tone: 'grey'};
    if (owes > 0) return {label: 'Owes', tone: 'slate'};
    if (subscriber.balance > 0) return {label: 'Credit', tone: 'green'};
    return {label: 'Settled', tone: 'green'};
};

const matches = (row: Row, filter: Filter) => {
    if (filter === 'owes') return row.owes > 0;
    if (filter === 'credit') return row.subscriber.balance > 0;
    if (filter === 'exempt') return row.subscriber.billingExempt;
    return true;
};

export default function Subscribers() {
    const {showError} = useToast();
    const {refreshCounts} = useAdminNav();
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [memberships, setMemberships] = useState<MembershipResponse[]>([]);
    const [debts, setDebts] = useState<Map<string, number> | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('everyone');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    /** undefined: no form; null: adding; a subscriber: editing. */
    const [formFor, setFormFor] = useState<SubscriberResponse | null | undefined>(undefined);

    const load = useCallback(async () => {
        try {
            const [loadedSubscribers, loadedServices] = await Promise.all([
                getJson<SubscriberResponse[]>(API_CONFIG.SUBSCRIBERS_URL, 'Could not load subscribers'),
                getServices()
            ]);
            setSubscribers(sortByName(loadedSubscribers));
            setServices(loadedServices);
            const [loadedMemberships, summary] = await Promise.all([
                getAllMemberships(loadedServices),
                getJson<FinanceSummary>(API_CONFIG.ADMIN_FINANCE_SUMMARY_URL, 'Could not load debts').catch(() => null)
            ]);
            setMemberships(loadedMemberships);
            setDebts(summary
                ? new Map(summary.debtors.map((debtor) => [debtor.subscriberId, Number(debtor.netDebt)]))
                : null);
        } catch (error) {
            showError('Could not load subscribers', error instanceof Error ? error.message : undefined);
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        load();
    }, [load]);

    const month = currentMonth();

    const rows = useMemo<Row[]>(() => {
        const serviceNames = new Map(services.map((service) => [service.id, service.name]));
        const servicesBySubscriber = new Map<string, string[]>();
        for (const membership of memberships) {
            if (!isActiveIn(membership, month)) continue;
            const list = servicesBySubscriber.get(membership.subscriberId) ?? [];
            list.push(serviceNames.get(membership.subscriptionServiceId) ?? membership.subscriptionServiceName);
            servicesBySubscriber.set(membership.subscriberId, list);
        }
        return subscribers.map((subscriber) => {
            const owes = debts?.get(subscriber.id) ?? 0;
            return {
                subscriber,
                services: (servicesBySubscriber.get(subscriber.id) ?? []).sort(),
                owes,
                status: statusOf(subscriber, owes)
            };
        });
    }, [subscribers, services, memberships, debts, month]);

    const membersByServiceName = useMemo(() => {
        const counts = activeMemberCounts(memberships, month);
        return new Map(services.map((service) => [service.name, counts.get(service.id) ?? 0]));
    }, [memberships, services, month]);

    const query = search.trim().toLocaleLowerCase();
    const searched = query
        ? rows.filter((row) => `${row.subscriber.name} ${row.subscriber.surname ?? ''}`.toLocaleLowerCase().includes(query))
        : rows;
    const visible = searched.filter((row) => matches(row, filter));
    const countOf = (value: Filter) => searched.filter((row) => matches(row, value)).length;

    const selected = subscribers.find((subscriber) => subscriber.id === selectedId) ?? null;

    const afterChange = async () => {
        await load();
        refreshCounts();
    };

    const addButton = (
        <button type="button" className="ui-btn is-primary" onClick={() => setFormFor(null)}>Add subscriber</button>
    );

    return (
        <>
            <PageHeader eyebrow="People" title="Subscribers" actions={addButton}/>
            <div className="ui-page-body sub-body">
                <div className="ui-filters">
                    <input
                        type="search"
                        className="ui-input is-compact sub-search"
                        placeholder="Search by name"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        aria-label="Search by name"
                    />
                    <Segmented<Filter>
                        ariaLabel="Show"
                        value={filter}
                        onChange={setFilter}
                        options={[
                            {value: 'everyone', label: 'Everyone', count: countOf('everyone')},
                            {value: 'owes', label: 'Owes', count: countOf('owes')},
                            {value: 'credit', label: 'Credit', count: countOf('credit')},
                            {value: 'exempt', label: 'Exempt', count: countOf('exempt')}
                        ]}
                    />
                </div>

                {loading ? (
                    <TableSkeleton columns="1.3fr 1fr 112px 100px 88px" rows={10}/>
                ) : subscribers.length === 0 ? (
                    <EmptyState title="No subscribers yet" action={addButton}>
                        Add the people who share the family’s subscriptions. They sign in with the email you enter.
                    </EmptyState>
                ) : visible.length === 0 ? (
                    <EmptyState title="Nobody matches">Try another name or filter.</EmptyState>
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table sub-table">
                            <thead>
                            <tr>
                                <th>Name</th>
                                <th>Services</th>
                                <th className="is-num">Owes</th>
                                <th className="is-num">Balance</th>
                                <th className="is-num">Status</th>
                            </tr>
                            </thead>
                            <tbody>
                            {visible.map(({subscriber, services: names, owes, status}) => (
                                <tr
                                    key={subscriber.id}
                                    className={`is-clickable ${subscriber.id === selectedId ? 'is-selected' : ''}`}
                                    onClick={() => setSelectedId(subscriber.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            setSelectedId(subscriber.id);
                                        }
                                    }}
                                    tabIndex={0}
                                    aria-label={`Open ${subscriber.name}`}
                                >
                                    <td>
                                        <span className="sub-name">{subscriber.name}{subscriber.surname && ` ${subscriber.surname}`}</span>
                                        <span className="ui-cell-sub is-mono sub-email">{subscriber.email}</span>
                                    </td>
                                    <td className="sub-services">{names.length > 0 ? names.join(', ') : '—'}</td>
                                    <td className={`is-num ${owes > 0 ? '' : 'sub-zero'}`}>
                                        {debts !== null && owes > 0 ? formatMoney(owes) : '—'}
                                    </td>
                                    <td className={`is-num ${subscriber.balance > 0 ? 'sub-credit' : 'sub-zero'}`}>
                                        {subscriber.balance > 0 ? formatMoney(subscriber.balance) : '—'}
                                    </td>
                                    <td className="is-num"><Tag tone={status.tone}>{status.label}</Tag></td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selected && formFor === undefined && (
                <SubscriberDetailDrawer
                    key={selected.id}
                    subscriber={selected}
                    membersByServiceName={membersByServiceName}
                    onClose={() => setSelectedId(null)}
                    onEdit={() => setFormFor(selected)}
                    onChanged={afterChange}
                    onDeleted={() => {
                        setSelectedId(null);
                        afterChange();
                    }}
                />
            )}

            {formFor !== undefined && (
                <SubscriberFormDrawer
                    subscriber={formFor}
                    onClose={() => setFormFor(undefined)}
                    onSaved={(saved) => {
                        setFormFor(undefined);
                        setSelectedId(saved.id);
                        afterChange();
                    }}
                />
            )}
        </>
    );
}
