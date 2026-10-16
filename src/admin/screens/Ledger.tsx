import {useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {useToast} from '../../components/ToastContext';
import type {RunRecoveryPreviewResponse, RunUndoRequest, RunUndoResponse} from '../../types/adminAction';
import type {ChargeResponse} from '../../types/charge';
import type {CostCalculationRequest, CostCalculationResult, CostCalculationSuggestion} from '../../types/costCalculation';
import type {InvoiceResponse} from '../../types/invoice';
import type {CalculationBatch, LedgerEntry} from '../../types/ledger';
import type {SubscriberResponse} from '../../types/subscriber';
import type {SubscriptionServiceResponse} from '../../types/subscription';
import {EmptyState, Notice, PageHeader, TableSkeleton} from '../../ui/components';
import {useConfirm} from '../../ui/confirmContext';
import {currentMonth, formatInstantDate, formatMoney, formatMonthLong, formatPeriod, formatWhen, plural} from '../../ui/format';
import {getResponseErrorMessage} from '../../utils/errors';
import {errorMessage, fetchAllCharges, fetchServices} from './chargeData';
import LedgerPipeline from './ledger/LedgerPipeline';
import {EntryDrawer, FiltersDrawer, RangeDrawer} from './ledger/LedgerDrawers';
import {
    actorName,
    applyInvoiceState,
    buildFilterRequest,
    countAdvanced,
    emptyFilters,
    hasFilters,
    type InvoiceState,
    type LedgerFilters,
    sumAmounts
} from './ledger/ledgerModel';
import {EntryTable, GroupedEntries} from './ledger/RunEntries';
import './Ledger.css';

const RUN_PAGE = 24;

interface RunSummary {
    total: number;
    invoiced: number;
}

interface RunsLoad {
    key: string;
    runs: CalculationBatch[];
    summary: Record<string, RunSummary>;
}

interface EntriesLoad {
    key: string;
    entries: LedgerEntry[];
}

const runPeriod = (run: { fromMonth: string; toMonth: string }) =>
    run.fromMonth === run.toMonth ? formatMonthLong(run.fromMonth) : formatPeriod(run.fromMonth, run.toMonth);

const postFilter = async (body: object): Promise<LedgerEntry[]> => {
    const response = await apiFetch(`${API_CONFIG.LEDGER_URL}/filter`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await getResponseErrorMessage(response, 'Couldn’t read the ledger.'));
    const data = await response.json();
    return Array.isArray(data) ? data : [];
};

export default function Ledger() {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();

    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [charges, setCharges] = useState<ChargeResponse[] | undefined>();
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [invoices, setInvoices] = useState<InvoiceResponse[] | null | undefined>();
    const [suggestion, setSuggestion] = useState<CostCalculationSuggestion | null>(null);

    /** Bumped after a run or an undo so every view re-reads. */
    const [version, setVersion] = useState(0);
    const [runLimit, setRunLimit] = useState(RUN_PAGE);
    const [runsLoad, setRunsLoad] = useState<RunsLoad | null>(null);
    const [chosenMonth, setChosenMonth] = useState('');
    const [chosenRunId, setChosenRunId] = useState<string | null>(null);
    const [monthLoad, setMonthLoad] = useState<EntriesLoad | null>(null);
    const [runEntriesLoad, setRunEntriesLoad] = useState<EntriesLoad | null>(null);
    const [filters, setFilters] = useState<LedgerFilters>(emptyFilters);
    const [filterLoad, setFilterLoad] = useState<EntriesLoad | null>(null);

    const [running, setRunning] = useState(false);
    const [rangeOpen, setRangeOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [entryId, setEntryId] = useState<string | null>(null);
    const [undoingRunId, setUndoingRunId] = useState<string | null>(null);

    // Reference data the screen reads once.
    useEffect(() => {
        const loadReference = async () => {
            try {
                const nextServices = await fetchServices();
                setServices(nextServices);
                setCharges(await fetchAllCharges(nextServices));
            } catch (error) {
                setCharges([]);
                showError('Couldn’t load charges', errorMessage(error, 'Try again in a moment.'));
            }
        };
        const loadSubscribers = async () => {
            try {
                const response = await apiFetch(API_CONFIG.SUBSCRIBERS_URL);
                if (response.ok) {
                    const data = await response.json();
                    setSubscribers(Array.isArray(data) ? data : []);
                }
            } catch {
                // Names fall back to emails; the filter just lists nobody.
            }
        };
        const loadInvoices = async () => {
            try {
                const response = await apiFetch(API_CONFIG.INVOICES_URL);
                const data = response.ok ? await response.json() : null;
                setInvoices(Array.isArray(data) ? data : null);
            } catch {
                setInvoices(null);
            }
        };
        void loadReference();
        void loadSubscribers();
        void loadInvoices();
    }, [showError]);

    useEffect(() => {
        const loadSuggestion = async () => {
            try {
                const response = await apiFetch(`${API_CONFIG.COST_CALCULATIONS_URL}/suggested-period`);
                if (response.ok) setSuggestion(await response.json());
            } catch {
                // The month picker falls back to the current month.
            }
        };
        void loadSuggestion();
    }, [version]);

    // Runs, plus each run's total and how much of it is invoiced.
    const runsKey = `${version}:${runLimit}`;
    useEffect(() => {
        let active = true;
        const loadRuns = async () => {
            try {
                const response = await apiFetch(`${API_CONFIG.LEDGER_URL}/calculation-batches?limit=${runLimit}`);
                if (!response.ok) {
                    throw new Error(await getResponseErrorMessage(response, 'Try again in a moment.'));
                }
                const data = await response.json();
                const runs: CalculationBatch[] = Array.isArray(data) ? data : [];
                const earliest = runs.reduce<string | null>(
                    (min, run) => (min === null || run.fromMonth < min ? run.fromMonth : min), null
                );
                const entries = earliest ? await postFilter({fromMonth: earliest}) : [];
                const summary: Record<string, RunSummary> = {};
                const byRun = new Map<string, LedgerEntry[]>();
                entries.forEach((entry) => {
                    const list = byRun.get(entry.calculationBatchId) ?? [];
                    list.push(entry);
                    byRun.set(entry.calculationBatchId, list);
                });
                byRun.forEach((list, runId) => {
                    summary[runId] = {
                        total: sumAmounts(list.map((entry) => entry.amount)),
                        invoiced: list.filter((entry) => entry.invoiceId).length
                    };
                });
                if (active) setRunsLoad({key: runsKey, runs, summary});
            } catch (error) {
                if (active) {
                    setRunsLoad({key: runsKey, runs: [], summary: {}});
                    showError('Couldn’t load cost runs', errorMessage(error, 'Try again in a moment.'));
                }
            }
        };
        void loadRuns();
        return () => {
            active = false;
        };
    }, [runsKey, runLimit, showError]);

    const defaultMonth = useMemo(() => {
        const now = currentMonth();
        if (!suggestion) return now;
        return suggestion.suggestedFromMonth < now ? suggestion.suggestedFromMonth : now;
    }, [suggestion]);
    const month = chosenMonth || defaultMonth;

    const monthKey = `${month}:${version}`;
    useEffect(() => {
        let active = true;
        const loadMonth = async () => {
            try {
                const entries = await postFilter({recordedMonth: month});
                if (active) setMonthLoad({key: monthKey, entries});
            } catch {
                if (active) setMonthLoad({key: monthKey, entries: []});
            }
        };
        void loadMonth();
        return () => {
            active = false;
        };
    }, [month, monthKey]);

    const runs = runsLoad?.runs;
    const selectedRun = useMemo(() => {
        if (!runs || runs.length === 0) return null;
        const chosen = chosenRunId ? runs.find((run) => run.id === chosenRunId) : undefined;
        if (chosen) return chosen;
        // Without a pick, show the live run that covers the month on the pipeline.
        return runs.find((run) => !run.undoneAt && run.fromMonth <= month && month <= run.toMonth)
            ?? runs.find((run) => !run.undoneAt)
            ?? runs[0];
    }, [runs, chosenRunId, month]);
    const selectedRunId = selectedRun?.id ?? null;

    const runEntriesKey = `${selectedRunId}:${version}`;
    useEffect(() => {
        if (!selectedRunId) return;
        let active = true;
        const loadRunEntries = async () => {
            try {
                const response = await apiFetch(`${API_CONFIG.LEDGER_URL}/calculation-batches/${selectedRunId}/entries`);
                if (!response.ok) {
                    throw new Error(await getResponseErrorMessage(response, 'Try again in a moment.'));
                }
                const data = await response.json();
                if (active) setRunEntriesLoad({key: runEntriesKey, entries: Array.isArray(data) ? data : []});
            } catch (error) {
                if (active) {
                    setRunEntriesLoad({key: runEntriesKey, entries: []});
                    showError('Couldn’t load the run’s entries', errorMessage(error, 'Try again in a moment.'));
                }
            }
        };
        void loadRunEntries();
        return () => {
            active = false;
        };
    }, [selectedRunId, runEntriesKey, showError]);

    const filtering = hasFilters(filters);
    const filterRequest = useMemo(() => buildFilterRequest(filters, selectedRunId), [filters, selectedRunId]);
    const filterKey = filtering ? `${JSON.stringify(filterRequest)}:${filters.invoiceState}:${version}` : '';
    useEffect(() => {
        if (!filterKey) return;
        let active = true;
        const loadFiltered = async () => {
            try {
                const entries = await postFilter(filterRequest);
                if (active) setFilterLoad({key: filterKey, entries});
            } catch (error) {
                if (active) {
                    setFilterLoad({key: filterKey, entries: []});
                    showError('Couldn’t filter the ledger', errorMessage(error, 'Try again in a moment.'));
                }
            }
        };
        void loadFiltered();
        return () => {
            active = false;
        };
    }, [filterKey, filterRequest, showError]);

    const monthOptions = useMemo(() => {
        const set = new Set<string>([currentMonth(), month]);
        charges?.forEach((charge) => set.add(charge.chargeMonth));
        runs?.forEach((run) => {
            set.add(run.fromMonth);
            set.add(run.toMonth);
        });
        if (suggestion) {
            set.add(suggestion.suggestedFromMonth);
            set.add(suggestion.suggestedToMonth);
        }
        return Array.from(set).sort().reverse();
    }, [charges, runs, suggestion, month]);

    const refresh = () => setVersion((current) => current + 1);

    const runCalculation = async (fromMonth: string, toMonth: string) => {
        if (running) return;
        setRunning(true);
        const period = fromMonth === toMonth ? formatMonthLong(fromMonth) : formatPeriod(fromMonth, toMonth);
        try {
            const response = await apiFetch(API_CONFIG.COST_CALCULATIONS_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({fromMonth, toMonth} satisfies CostCalculationRequest)
            });
            if (!response.ok) {
                showError(`Couldn’t calculate ${period}`, await getResponseErrorMessage(response, 'Try again in a moment.'));
                return;
            }
            const result: CostCalculationResult = await response.json();
            setRangeOpen(false);
            if (result.batchId === null) {
                showSuccess(
                    'Nothing new to calculate',
                    result.chargesSkipped > 0
                        ? `${period}: ${plural(result.chargesSkipped, 'charge')} already calculated.`
                        : `${period} has no charges yet.`
                );
                return;
            }
            const skipped = result.chargesSkipped > 0 ? ` · ${result.chargesSkipped} already done` : '';
            showSuccess(
                `${period} calculated`,
                `${plural(result.ledgerEntriesCreated, 'ledger entry', 'ledger entries')} from ${plural(result.chargesProcessed, 'charge')}${skipped}`
            );
            setChosenRunId(result.batchId);
            refresh();
        } catch {
            showError(`Couldn’t calculate ${period}`, 'The server could not be reached.');
        } finally {
            setRunning(false);
        }
    };

    const undoRun = async (run: CalculationBatch) => {
        const period = runPeriod(run);
        setUndoingRunId(run.id);
        let preview: RunRecoveryPreviewResponse;
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_RECOVERY_URL}/cost-runs/${run.id}/preview`);
            if (!response.ok) {
                showError(`Couldn’t check the ${period} run`, await getResponseErrorMessage(response, 'Try again in a moment.'));
                return;
            }
            preview = await response.json();
        } catch {
            showError(`Couldn’t check the ${period} run`, 'The server could not be reached.');
            return;
        } finally {
            setUndoingRunId(null);
        }
        if (!preview.allowed) {
            showError(`The ${period} run can’t be undone`, preview.blockers.join(' '));
            return;
        }
        const deleted = Number(preview.effects.ledgerEntriesDeleted ?? run.ledgerEntryCount);
        const {confirmed, reason} = await confirm({
            title: `Undo the ${period} cost run?`,
            text: `Deletes its ${plural(deleted, 'ledger entry', 'ledger entries')}. None of them is on an invoice yet, so nothing else changes. You can run the calculation again afterwards.`,
            confirmLabel: 'Undo run',
            tone: 'dark',
            reason: {label: 'Reason', placeholder: 'Optional, e.g. a charge was wrong'}
        });
        if (!confirmed) return;
        setUndoingRunId(run.id);
        try {
            const body: RunUndoRequest = reason.trim() ? {reason: reason.trim()} : {};
            const response = await apiFetch(`${API_CONFIG.ADMIN_RECOVERY_URL}/cost-runs/${run.id}/undo`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                showError(`Couldn’t undo the ${period} run`, await getResponseErrorMessage(response, 'Try again in a moment.'));
                return;
            }
            const result: RunUndoResponse = await response.json();
            const removed = Number(result.effects.ledgerEntriesDeleted ?? deleted);
            showSuccess(`${period} cost run undone`, `${plural(removed, 'ledger entry', 'ledger entries')} deleted`);
            refresh();
        } catch {
            showError(`Couldn’t undo the ${period} run`, 'The server could not be reached.');
        } finally {
            setUndoingRunId(null);
        }
    };

    const setFilter = <K extends keyof LedgerFilters>(key: K, value: LedgerFilters[K]) =>
        setFilters((current) => ({...current, [key]: value}));

    const monthEntries = monthLoad?.key === monthKey ? monthLoad.entries : undefined;
    const runEntries = runEntriesLoad?.key === runEntriesKey ? runEntriesLoad.entries : undefined;
    const filteredEntries = filtering && filterLoad?.key === filterKey
        ? applyInvoiceState(filterLoad.entries, filters.invoiceState)
        : undefined;
    const advancedCount = countAdvanced(filters);

    const renderRunStatus = (run: CalculationBatch) => {
        if (run.undoneAt) return <span className="led-run-status">Undone</span>;
        const summary = runsLoad?.summary[run.id];
        const invoiced = summary?.invoiced ?? 0;
        if (run.ledgerEntryCount > 0 && invoiced >= run.ledgerEntryCount) {
            return <span className="led-run-status">Invoiced</span>;
        }
        if (invoiced > 0) return <span className="led-run-status">Partly invoiced</span>;
        return (
            <button type="button" className="ui-link-btn is-danger led-run-undo" disabled={undoingRunId === run.id}
                    onClick={() => void undoRun(run)}>
                {undoingRunId === run.id ? 'Checking…' : 'Undo run'}
            </button>
        );
    };

    const renderEntries = () => {
        if (filtering) {
            if (!filteredEntries) return <TableSkeleton columns="1fr 1fr 80px 90px 70px" rows={6}/>;
            if (filteredEntries.length === 0) {
                return (
                    <EmptyState title="No entries match these filters"
                                action={<button type="button" className="ui-btn" onClick={() => setFilters(emptyFilters())}>Clear filters</button>}>
                        {filters.allRuns || !selectedRun ? 'Searched every run.' : `Searched the ${runPeriod(selectedRun)} run.`}
                    </EmptyState>
                );
            }
            return <EntryTable entries={filteredEntries} onOpenEntry={setEntryId}/>;
        }
        if (!runs) return <TableSkeleton columns="150px 1fr 110px" rows={5}/>;
        if (!selectedRun) {
            return (
                <EmptyState title="No cost runs yet">
                    Add the month’s charges, then run the cost calculation to split them across members.
                </EmptyState>
            );
        }
        if (selectedRun.undoneAt) {
            return (
                <Notice tone="grey">
                    Undone {formatWhen(selectedRun.undoneAt)}
                    {selectedRun.undoneByAccountId && (
                        <> by {actorName(selectedRun.undoneByAccountName ?? null, selectedRun.undoneByAccountId, subscribers)}</>
                    )}
                    . Its entries were deleted{selectedRun.undoReason ? `. Reason: ${selectedRun.undoReason}` : '.'}
                </Notice>
            );
        }
        if (!runEntries) return <TableSkeleton columns="150px 1fr 110px" rows={5}/>;
        if (runEntries.length === 0) {
            return <EmptyState title="This run has no entries">It found no charges left to split.</EmptyState>;
        }
        return (
            <GroupedEntries entries={runEntries} onOpenEntry={setEntryId}
                            showMonth={selectedRun.fromMonth !== selectedRun.toMonth}/>
        );
    };

    return (
        <>
            <PageHeader
                eyebrow="Billing"
                title="Ledger"
                lead="A cost calculation splits each charge evenly across that month’s active members."
                actions={
                    <>
                        <select className="ui-select led-month-select" aria-label="Month" value={month}
                                onChange={(event) => {
                                    setChosenMonth(event.target.value);
                                    setChosenRunId(null);
                                }}>
                            {monthOptions.map((option) => (
                                <option key={option} value={option}>{formatMonthLong(option)}</option>
                            ))}
                        </select>
                        <button type="button" className="ui-btn is-primary" disabled={running}
                                onClick={() => void runCalculation(month, month)}>
                            {running ? 'Calculating…' : 'Run cost calculation'}
                        </button>
                    </>
                }
            />

            <LedgerPipeline
                month={month}
                charges={charges}
                entries={monthEntries}
                invoices={invoices}
                action={
                    <button type="button" className="ui-link-btn is-muted" onClick={() => setRangeOpen(true)}>
                        Calculate several months
                    </button>
                }
            />

            <div className="led-main">
                <section className="led-runs" aria-label="Cost runs">
                    <h2 className="ui-section-title led-col-title">Runs</h2>
                    {!runs ? (
                        <TableSkeleton columns="1fr 80px" rows={5}/>
                    ) : runs.length === 0 ? (
                        <p className="led-runs-empty">No cost runs yet.</p>
                    ) : (
                        <ul className="led-run-list">
                            {runs.map((run) => {
                                const summary = runsLoad?.summary[run.id];
                                return (
                                    <li key={run.id}
                                        className={`led-run ${run.id === selectedRunId ? 'is-selected' : ''} ${run.undoneAt ? 'is-undone' : ''}`}>
                                        <button type="button" className="led-run-select"
                                                aria-pressed={run.id === selectedRunId}
                                                onClick={() => setChosenRunId(run.id)}>
                                            <span className="led-run-top">
                                                <span className="led-run-period">{runPeriod(run)}</span>
                                                <span className="led-run-total">
                                                    {run.undoneAt ? '—' : formatMoney(summary?.total ?? 0)}
                                                </span>
                                            </span>
                                            <span className="led-run-meta">
                                                Run {formatInstantDate(run.createdAt)} · {plural(run.ledgerEntryCount, 'entry', 'entries')}
                                            </span>
                                        </button>
                                        <span className="led-run-act">{renderRunStatus(run)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {runs && runs.length >= runLimit && (
                        <button type="button" className="ui-link-btn is-muted led-runs-more"
                                onClick={() => setRunLimit((current) => current + RUN_PAGE)}>
                            Show older runs
                        </button>
                    )}
                </section>

                <section className="led-entries" aria-label="Ledger entries">
                    <div className="led-entries-head">
                        <h2 className="ui-section-title led-col-title">
                            {filtering
                                ? `Filtered · ${filteredEntries ? plural(filteredEntries.length, 'entry', 'entries') : '…'}`
                                : selectedRun
                                    ? `${runPeriod(selectedRun)} · ${plural(selectedRun.ledgerEntryCount, 'entry', 'entries')}`
                                    : 'Entries'}
                        </h2>
                        {selectedRun && !filtering && (
                            <span className="led-entries-by">
                                Run {formatWhen(selectedRun.createdAt)} by{' '}
                                {actorName(selectedRun.generatedByAccountName, selectedRun.generatedByAccountId, subscribers)}
                            </span>
                        )}
                        {filtering && (
                            <span className="led-entries-by">
                                {filters.allRuns || !selectedRun ? 'Across every run' : `Within the ${runPeriod(selectedRun)} run`}
                            </span>
                        )}
                    </div>

                    <div className="ui-filters led-filters">
                        <select className="ui-select is-compact" aria-label="Service" value={filters.serviceId}
                                onChange={(event) => setFilter('serviceId', event.target.value)}>
                            <option value="">All services</option>
                            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                        </select>
                        <select className="ui-select is-compact" aria-label="Subscriber" value={filters.subscriberId}
                                onChange={(event) => setFilter('subscriberId', event.target.value)}>
                            <option value="">All subscribers</option>
                            {subscribers.map((subscriber) => (
                                <option key={subscriber.id} value={subscriber.id}>{subscriber.name}</option>
                            ))}
                        </select>
                        <input type="month" className="ui-input is-compact led-filter-month" aria-label="Month"
                               value={filters.recordedMonth}
                               onChange={(event) => setFilter('recordedMonth', event.target.value)}/>
                        <select className="ui-select is-compact" aria-label="Invoice" value={filters.invoiceState}
                                onChange={(event) => setFilter('invoiceState', event.target.value as InvoiceState)}>
                            <option value="all">Invoiced or not</option>
                            <option value="invoiced">Invoiced</option>
                            <option value="open">Not invoiced</option>
                        </select>
                        <button type="button" className="ui-link-btn" onClick={() => setFiltersOpen(true)}>
                            More filters{advancedCount > 0 ? ` (${advancedCount})` : ''}
                        </button>
                        {(filtering || filters.allRuns) && (
                            <button type="button" className="ui-link-btn is-muted" onClick={() => setFilters(emptyFilters())}>
                                Clear
                            </button>
                        )}
                    </div>

                    {renderEntries()}
                </section>
            </div>

            {rangeOpen && (
                <RangeDrawer suggestion={suggestion} running={running} onClose={() => setRangeOpen(false)}
                             onRun={(fromMonth, toMonth) => void runCalculation(fromMonth, toMonth)}/>
            )}
            {filtersOpen && (
                <FiltersDrawer filters={filters} hasRun={Boolean(selectedRun)} onClose={() => setFiltersOpen(false)}
                               onApply={(next) => {
                                   setFilters(next);
                                   setFiltersOpen(false);
                               }}/>
            )}
            {entryId && <EntryDrawer entryId={entryId} subscribers={subscribers} onClose={() => setEntryId(null)}/>}
        </>
    );
}
