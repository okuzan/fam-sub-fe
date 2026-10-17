import {useCallback, useEffect, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import type {DebtorFinance, FinanceSummary} from '../../types/finance';
import {getResponseErrorMessage} from '../../utils/errors';
import {EmptyState, Notice, PageHeader, TableSkeleton} from '../../ui/components';
import {formatInstantDate, formatMoney, plural} from '../../ui/format';
import './Finance.css';
import {useSubscriberNames} from '../subscriberNames';
import {SortHeader} from '../../ui/sorting';
import {useSort} from '../../ui/useSort';

const PERCENT = new Intl.NumberFormat('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const formatPercent = (value: number) => `${PERCENT.format(value)}%`;

export default function Finance() {
    const names = useSubscriberNames();
    const [summary, setSummary] = useState<FinanceSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiFetch(API_CONFIG.ADMIN_FINANCE_SUMMARY_URL, {signal});
            if (!response.ok) {
                throw new Error(await getResponseErrorMessage(response, 'Could not load the finance summary'));
            }
            setSummary(await response.json() as FinanceSummary);
        } catch (fetchError) {
            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
            setError(fetchError instanceof Error ? fetchError.message : 'Could not load the finance summary');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void fetchSummary(controller.signal);
        return () => controller.abort();
    }, [fetchSummary]);

    const oldest = summary?.oldestUnpaidInvoice ?? null;
    const metrics = summary ? [
        {
            label: 'Unpaid invoices',
            value: formatMoney(summary.unpaidInvoiceAmount),
            note: `${plural(summary.unpaidInvoiceCount, 'invoice')}, draft and sent`
        },
        {
            label: 'Cabinet balances',
            value: formatMoney(summary.totalCabinetBalance),
            note: 'Prepaid credit across all subscribers'
        },
        {
            label: 'Balance applied to debt',
            value: formatMoney(summary.balanceAppliedToDebt),
            note: 'Balances of people who also owe'
        },
        {
            label: 'Unapplied credit',
            value: formatMoney(summary.unappliedCredit),
            note: 'Balances of people who owe nothing'
        },
        {
            label: 'Average debt',
            value: formatMoney(summary.averageDebt),
            note: `Across ${plural(summary.debtorCount, 'debtor')}`
        },
        {
            label: 'Oldest unpaid invoice',
            value: oldest ? `open ${plural(oldest.ageDays, 'day')}` : 'None',
            note: oldest
                ? `${names.short(oldest.subscriberId, oldest.subscriberName)} · ${formatMoney(oldest.amount)} · ${formatInstantDate(oldest.createdAt)}`
                : 'Every invoice is paid'
        }
    ] : [];

    const {sorted: debtors, sort, toggle} = useSort(summary?.debtors ?? [], {
        subscriber: (debtor: DebtorFinance) => names.full(debtor.subscriberId, debtor.subscriberName),
        invoices: (debtor: DebtorFinance) => debtor.unpaidInvoiceCount,
        unpaid: (debtor: DebtorFinance) => Number(debtor.unpaidInvoiceAmount),
        balance: (debtor: DebtorFinance) => Number(debtor.cabinetBalance),
        net: (debtor: DebtorFinance) => Number(debtor.netDebt)
    });
    const maxNet = summary ? Math.max(0, ...summary.debtors.map((debtor) => debtor.netDebt)) : 0;

    return (
        <>
            <PageHeader
                ruled
                eyebrow={`Net outstanding debt · ${formatInstantDate(summary?.generatedAt ?? new Date().toISOString())}`}
                title={<span className="fin-net">{summary ? formatMoney(summary.netOutstandingDebt) : '—'}</span>}
                lead="Unpaid invoices minus the part of cabinet balances that covers them."
                actions={
                    <button type="button" className="ui-btn" onClick={() => void fetchSummary()} disabled={loading}>
                        {loading && summary ? 'Refreshing…' : 'Refresh'}
                    </button>
                }
            />

            {error && (
                <div className="fin-notice">
                    <Notice tone="red">{error}</Notice>
                </div>
            )}

            {summary && (
                <div className="fin-metrics">
                    {metrics.map((metric) => (
                        <div key={metric.label} className="fin-metric">
                            <span className="ui-label">{metric.label}</span>
                            <span className="fin-metric-value">{metric.value}</span>
                            <span className="fin-metric-note">{metric.note}</span>
                        </div>
                    ))}
                </div>
            )}

            <section className="fin-debtors">
                <div className="fin-debtors-head">
                    <h2 className="ui-section-title">Debtors</h2>
                    {summary && summary.debtors.length > 0 && (
                        <span className="fin-debtors-line">
                            {plural(summary.debtorCount, 'debtor')} · net shares add up to 100%
                        </span>
                    )}
                </div>

                {!summary && loading && <TableSkeleton columns="1fr 76px 124px 110px 124px 210px" rows={8}/>}

                {summary && summary.debtors.length === 0 && (
                    <EmptyState title="Nobody owes anything">
                        Every unpaid invoice is covered by its subscriber’s balance, or there are none.
                    </EmptyState>
                )}

                {summary && summary.debtors.length > 0 && (
                    <div className="ui-table-wrap">
                        <table className="ui-table fin-table">
                            <thead>
                                <tr>
                                    <SortHeader column="subscriber" label="Subscriber" sort={sort} onSort={toggle}/>
                                    <SortHeader column="invoices" label="Invoices" sort={sort} onSort={toggle} className="is-num"/>
                                    <SortHeader column="unpaid" label="Unpaid" sort={sort} onSort={toggle} className="is-num"/>
                                    <SortHeader column="balance" label="Balance" sort={sort} onSort={toggle} className="is-num"/>
                                    <SortHeader column="net" label="Net debt" sort={sort} onSort={toggle} className="is-num"/>
                                    <th className="fin-share-col">Share</th>
                                </tr>
                            </thead>
                            <tbody>
                                {debtors.map((debtor) => (
                                    <tr key={debtor.subscriberId}>
                                        <td className="is-strong">{names.short(debtor.subscriberId, debtor.subscriberName)}</td>
                                        <td className="is-num fin-muted">{debtor.unpaidInvoiceCount}</td>
                                        <td className="is-num">{formatMoney(debtor.unpaidInvoiceAmount)}</td>
                                        <td className={`is-num ${debtor.cabinetBalance > 0 ? 'fin-credit' : 'fin-faint'}`}>
                                            {debtor.cabinetBalance !== 0 ? formatMoney(debtor.cabinetBalance) : '—'}
                                        </td>
                                        <td className="is-num fin-net-debt">{formatMoney(debtor.netDebt)}</td>
                                        <td className="fin-share-col">
                                            <div className="fin-share">
                                                <div className="fin-share-track">
                                                    <div
                                                        className="fin-share-bar"
                                                        style={{width: `${maxNet > 0 ? (debtor.netDebt / maxNet) * 100 : 0}%`}}
                                                    />
                                                </div>
                                                <span className="fin-share-pct">{formatPercent(debtor.debtSharePercent)}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}
