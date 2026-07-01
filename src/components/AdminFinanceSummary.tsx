import {useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG} from '../config/api';
import type {FinanceSummary} from '../types/finance';
import {getResponseErrorMessage} from '../utils/errors';

const CURRENCY_FORMATTER = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const DATE_FORMATTER = new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
});

const formatMoney = (amount: number) => CURRENCY_FORMATTER.format(amount);
const debtorColor = (index: number) => `hsl(${(index * 67 + 12) % 360} 78% 64%)`;

export default function AdminFinanceSummary() {
    const [expanded, setExpanded] = useState(false);
    const [summary, setSummary] = useState<FinanceSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(API_CONFIG.ADMIN_FINANCE_SUMMARY_URL, {
                credentials: 'include',
                signal
            });
            if (!response.ok) {
                throw new Error(await getResponseErrorMessage(response, 'Failed to load finance summary'));
            }
            setSummary(await response.json() as FinanceSummary);
        } catch (fetchError) {
            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
            setError(fetchError instanceof Error ? fetchError.message : 'Failed to load finance summary');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!expanded || summary) return;

        const controller = new AbortController();
        void fetchSummary(controller.signal);
        return () => controller.abort();
    }, [expanded, fetchSummary, summary]);

    const pieGradient = useMemo(() => {
        if (!summary || summary.debtors.length === 0) return 'rgba(255, 255, 255, 0.12)';

        let start = 0;
        const segments = summary.debtors.map((debtor, index) => {
            const end = start + debtor.debtSharePercent;
            const segment = `${debtorColor(index)} ${start}% ${end}%`;
            start = end;
            return segment;
        });
        if (start < 100) segments.push(`${debtorColor(summary.debtors.length - 1)} ${start}% 100%`);
        return `conic-gradient(${segments.join(', ')})`;
    }, [summary]);

    if (!expanded) {
        return (
            <button
                type="button"
                className="finance-summary-toggle"
                onClick={() => setExpanded(true)}
            >
                Show financial overview
            </button>
        );
    }

    if (loading && !summary) {
        return <section className="finance-summary finance-summary-state">Loading financial position…</section>;
    }

    if (error && !summary) {
        return (
            <section className="finance-summary finance-summary-state finance-summary-error">
                <span>{error}</span>
                <button type="button" onClick={() => void fetchSummary()}>Retry</button>
            </section>
        );
    }

    if (!summary) return null;

    const oldest = summary.oldestUnpaidInvoice;

    return (
        <section className="finance-summary" aria-labelledby="finance-summary-title">
            <div className="finance-summary-heading">
                <div>
                    <p className="finance-summary-kicker">Financial position</p>
                    <h2 id="finance-summary-title">{formatMoney(summary.netOutstandingDebt)} outstanding</h2>
                    <p>Net collectible debt after each subscriber’s cabinet balance.</p>
                </div>
                <div className="finance-summary-actions">
                    <button type="button" onClick={() => void fetchSummary()} disabled={loading}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <button type="button" onClick={() => setExpanded(false)}>Hide</button>
                </div>
            </div>

            {error && <p className="finance-summary-inline-error">{error}</p>}

            <div className="finance-metrics">
                <div>
                    <span>Cabinet balances</span>
                    <strong>{formatMoney(summary.totalCabinetBalance)}</strong>
                </div>
                <div>
                    <span>Unpaid invoices</span>
                    <strong>{formatMoney(summary.unpaidInvoiceAmount)}</strong>
                    <small>{summary.unpaidInvoiceCount} invoice{summary.unpaidInvoiceCount === 1 ? '' : 's'}</small>
                </div>
                <div>
                    <span>Balance covering debt</span>
                    <strong>{formatMoney(summary.balanceAppliedToDebt)}</strong>
                </div>
                <div>
                    <span>Unapplied credit</span>
                    <strong>{formatMoney(summary.unappliedCredit)}</strong>
                </div>
                <div>
                    <span>Average net debt</span>
                    <strong>{formatMoney(summary.averageDebt)}</strong>
                    <small>across {summary.debtorCount} debtor{summary.debtorCount === 1 ? '' : 's'}</small>
                </div>
                <div>
                    <span>Oldest unpaid</span>
                    <strong>{oldest ? `${oldest.ageDays} days` : 'None'}</strong>
                    {oldest && (
                        <small>
                            {oldest.subscriberName} · {formatMoney(oldest.amount)} · {DATE_FORMATTER.format(new Date(oldest.createdAt))}
                        </small>
                    )}
                </div>
            </div>

            <div className="debtor-breakdown">
                <div
                    className={`debtor-pie${summary.debtors.length === 0 ? ' debtor-pie-empty' : ''}`}
                    style={{background: pieGradient}}
                    role="img"
                    aria-label={summary.debtors.length === 0 ? 'No outstanding debt' : 'Outstanding debt split by subscriber'}
                >
                    <div>
                        <strong>{summary.debtorCount}</strong>
                        <span>debtors</span>
                    </div>
                </div>

                <div className="debtor-legend">
                    <h3>Debt ownership</h3>
                    {summary.debtors.length === 0 ? (
                        <p>No subscriber has net debt.</p>
                    ) : summary.debtors.map((debtor, index) => (
                        <div className="debtor-row" key={debtor.subscriberId}>
                            <span className="debtor-swatch" style={{backgroundColor: debtorColor(index)}}/>
                            <span className="debtor-name">{debtor.subscriberName}</span>
                            <span className="debtor-amount">{formatMoney(debtor.netDebt)}</span>
                            <strong>{debtor.debtSharePercent.toFixed(2)}%</strong>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
