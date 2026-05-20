import {useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG} from '../config/api';
import type {LedgerEntry, LedgerEntryFilter, CalculationBatch} from '../types/ledger';
import type {SubscriberResponse} from '../types/subscriber';
import type {SubscriptionServiceResponse} from '../types/subscription';
import {getResponseErrorMessage} from '../utils/errors';
import {useToast} from './Toast';

type InvoiceAssignmentFilter = 'all' | 'assigned' | 'unassigned';

type LedgerFilterForm = {
    id: string;
    chargeId: string;
    serviceId: string;
    subscriberId: string;
    recordedMonth: string;
    fromMonth: string;
    toMonth: string;
    generatedByAccountId: string;
    invoiceId: string;
    invoiceAssignment: InvoiceAssignmentFilter;
};

const createInitialFilters = (): LedgerFilterForm => ({
    id: '',
    chargeId: '',
    serviceId: '',
    subscriberId: '',
    recordedMonth: '',
    fromMonth: '',
    toMonth: '',
    generatedByAccountId: '',
    invoiceId: '',
    invoiceAssignment: 'all'
});

const formatMonth = (month: string) => {
    if (!month) return '—';
    const date = new Date(month);
    return Number.isNaN(date.getTime())
        ? month
        : date.toLocaleDateString('en-US', {year: 'numeric', month: 'long'});
};

const formatTimestamp = (value: string) =>
    new Date(value).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

const getActorName = (name: string | null, id: string) => name ?? id;

const buildFilterRequest = (
    filters: LedgerFilterForm,
    selectedBatchId: string | null
): LedgerEntryFilter => {
    const request: LedgerEntryFilter = {};

    if (filters.id.trim()) request.id = filters.id.trim();
    if (filters.chargeId.trim()) request.chargeId = filters.chargeId.trim();
    if (filters.serviceId) request.serviceId = filters.serviceId;
    if (filters.subscriberId) request.subscriberId = filters.subscriberId;
    if (filters.recordedMonth) request.recordedMonth = filters.recordedMonth;
    if (filters.fromMonth) request.fromMonth = filters.fromMonth;
    if (filters.toMonth) request.toMonth = filters.toMonth;
    if (selectedBatchId) request.calculationBatchId = selectedBatchId;
    if (filters.generatedByAccountId.trim()) request.generatedByAccountId = filters.generatedByAccountId.trim();
    if (filters.invoiceId.trim()) request.invoiceId = filters.invoiceId.trim();

    return request;
};

const applyInvoiceAssignmentFilter = (entries: LedgerEntry[], filter: InvoiceAssignmentFilter) => {
    if (filter === 'assigned') {
        return entries.filter((entry) => Boolean(entry.invoiceId));
    }

    if (filter === 'unassigned') {
        return entries.filter((entry) => !entry.invoiceId);
    }

    return entries;
};

const hasEntryFilters = (filters: LedgerFilterForm) =>
    Boolean(
        filters.id.trim() ||
        filters.chargeId.trim() ||
        filters.serviceId ||
        filters.subscriberId ||
        filters.recordedMonth ||
        filters.fromMonth ||
        filters.toMonth ||
        filters.generatedByAccountId.trim() ||
        filters.invoiceId.trim() ||
        filters.invoiceAssignment !== 'all'
    );

export default function Ledger() {
    const {showError} = useToast();
    const [batches, setBatches] = useState<CalculationBatch[]>([]);
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
    const [filters, setFilters] = useState<LedgerFilterForm>(createInitialFilters);
    const [batchesLoading, setBatchesLoading] = useState(true);
    const [entriesLoading, setEntriesLoading] = useState(false);
    const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

    const selectedBatch = useMemo(
        () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
        [batches, selectedBatchId]
    );

    const fetchBatches = useCallback(async () => {
        setBatchesLoading(true);

        try {
            const response = await fetch(`${API_CONFIG.LEDGER_URL}/calculation-batches?limit=10`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                const nextBatches = Array.isArray(data) ? data : [];
                setBatches(nextBatches);
                setSelectedBatchId((currentBatchId) => currentBatchId ?? nextBatches[0]?.id ?? null);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch calculation runs'));
            }
        } catch (err) {
            console.error('Failed to fetch calculation runs:', err);
            showError('Error fetching calculation runs');
        } finally {
            setBatchesLoading(false);
        }
    }, [showError]);

    const fetchSubscribers = useCallback(async () => {
        try {
            const response = await fetch(API_CONFIG.SUBSCRIBERS_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSubscribers(Array.isArray(data) ? data : []);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch subscribers'));
            }
        } catch (err) {
            console.error('Failed to fetch subscribers:', err);
            showError('Error fetching subscribers');
        }
    }, [showError]);

    const fetchServices = useCallback(async () => {
        try {
            const response = await fetch(API_CONFIG.SUBSCRIPTION_SERVICES_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setServices(Array.isArray(data) ? data : []);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch services'));
            }
        } catch (err) {
            console.error('Failed to fetch services:', err);
            showError('Error fetching services');
        }
    }, [showError]);

    const fetchEntriesForBatch = useCallback(async (batchId: string) => {
        setEntriesLoading(true);
        setSelectedEntry(null);

        try {
            const response = await fetch(`${API_CONFIG.LEDGER_URL}/calculation-batches/${batchId}/entries`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setEntries(Array.isArray(data) ? data : []);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch ledger entries'));
            }
        } catch (err) {
            console.error('Failed to fetch ledger entries:', err);
            showError('Error fetching ledger entries');
        } finally {
            setEntriesLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        void fetchBatches();
        void fetchSubscribers();
        void fetchServices();
    }, [fetchBatches, fetchServices, fetchSubscribers]);

    useEffect(() => {
        if (selectedBatchId) {
            void fetchEntriesForBatch(selectedBatchId);
        }
    }, [fetchEntriesForBatch, selectedBatchId]);

    const fetchEntryDetails = async (entryId: string) => {
        setDetailLoadingId(entryId);

        try {
            const response = await fetch(`${API_CONFIG.LEDGER_URL}/entries/${entryId}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data: LedgerEntry = await response.json();
                setSelectedEntry(data);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch ledger entry details'));
            }
        } catch (err) {
            console.error('Failed to fetch ledger entry details:', err);
            showError('Error fetching ledger entry details');
        } finally {
            setDetailLoadingId(null);
        }
    };

    const applyFilters = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setEntriesLoading(true);
        setSelectedEntry(null);

        try {
            const response = await fetch(`${API_CONFIG.LEDGER_URL}/filter`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(buildFilterRequest(filters, selectedBatchId))
            });

            if (response.ok) {
                const data = await response.json();
                const nextEntries = Array.isArray(data) ? data : [];
                setEntries(applyInvoiceAssignmentFilter(nextEntries, filters.invoiceAssignment));
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to filter ledger entries'));
            }
        } catch (err) {
            console.error('Failed to filter ledger entries:', err);
            showError('Error filtering ledger entries');
        } finally {
            setEntriesLoading(false);
        }
    };

    const clearFilters = () => {
        setFilters(createInitialFilters());
        if (selectedBatchId) {
            void fetchEntriesForBatch(selectedBatchId);
        } else {
            setEntries([]);
        }
    };

    const handleBatchSelect = (batchId: string) => {
        setSelectedBatchId(batchId);
        if (hasEntryFilters(filters)) {
            setFilters(createInitialFilters());
        }
    };

    const updateFilter = (field: keyof LedgerFilterForm, value: string) => {
        setFilters((prev) => ({
            ...prev,
            [field]: value
        }));
    };

    return (
        <div className="ledger">
            <div className="ledger-header">
                <h2>Ledger Explorer</h2>
                <button type="button" className="btn btn-secondary" onClick={() => void fetchBatches()}>
                    Refresh Runs
                </button>
            </div>

            <div className="ledger-layout">
                <aside className="ledger-runs-pane">
                    <div className="ledger-pane-header">
                        <h3>Runs</h3>
                        <span>{batches.length} loaded</span>
                    </div>

                    {batchesLoading ? (
                        <div className="ledger-empty-state">Loading runs...</div>
                    ) : batches.length === 0 ? (
                        <div className="ledger-empty-state">No calculation runs found.</div>
                    ) : (
                        <div className="ledger-runs-list">
                            {batches.map((batch) => (
                                <button
                                    key={batch.id}
                                    type="button"
                                    className={`ledger-run ${selectedBatchId === batch.id ? 'ledger-run-selected' : ''}`}
                                    onClick={() => handleBatchSelect(batch.id)}
                                >
                                    <span className="ledger-run-id">{batch.id}</span>
                                    <span>{formatMonth(batch.fromMonth)} - {formatMonth(batch.toMonth)}</span>
                                    <span>{formatTimestamp(batch.createdAt)}</span>
                                    <span>{getActorName(batch.generatedByAccountName, batch.generatedByAccountId)}</span>
                                    <span>{batch.ledgerEntryCount.toLocaleString('en-US')} entries</span>
                                    {batch.undoneAt && <span className="ledger-run-undone">Undone {formatTimestamp(batch.undoneAt)}</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                <section className="ledger-entries-pane">
                    <div className="ledger-pane-header">
                        <div>
                            <h3>Entries</h3>
                            <p>{selectedBatch ? `${formatMonth(selectedBatch.fromMonth)} - ${formatMonth(selectedBatch.toMonth)}` : 'Select a run'}</p>
                        </div>
                        <span>{entries.length.toLocaleString('en-US')} entries</span>
                    </div>

                    <form className="ledger-filters" onSubmit={applyFilters}>
                        <div className="ledger-filter">
                            <label htmlFor="ledgerService">Service</label>
                            <select id="ledgerService" value={filters.serviceId} onChange={(e) => updateFilter('serviceId', e.target.value)}>
                                <option value="">All services</option>
                                {services.map((service) => (
                                    <option key={service.id} value={service.id}>{service.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="ledger-filter">
                            <label htmlFor="ledgerSubscriber">Subscriber</label>
                            <select id="ledgerSubscriber" value={filters.subscriberId} onChange={(e) => updateFilter('subscriberId', e.target.value)}>
                                <option value="">All subscribers</option>
                                {subscribers.map((subscriber) => (
                                    <option key={subscriber.id} value={subscriber.id}>{subscriber.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="ledger-filter">
                            <label htmlFor="ledgerFromMonth">From</label>
                            <input id="ledgerFromMonth" type="month" value={filters.fromMonth} onChange={(e) => updateFilter('fromMonth', e.target.value)}/>
                        </div>
                        <div className="ledger-filter">
                            <label htmlFor="ledgerToMonth">To</label>
                            <input id="ledgerToMonth" type="month" value={filters.toMonth} onChange={(e) => updateFilter('toMonth', e.target.value)}/>
                        </div>
                        <div className="ledger-filter">
                            <label htmlFor="ledgerRecordedMonth">Recorded Month</label>
                            <input id="ledgerRecordedMonth" type="month" value={filters.recordedMonth} onChange={(e) => updateFilter('recordedMonth', e.target.value)}/>
                        </div>
                        <div className="ledger-filter">
                            <label htmlFor="ledgerGeneratedBy">Generated By</label>
                            <input id="ledgerGeneratedBy" value={filters.generatedByAccountId} onChange={(e) => updateFilter('generatedByAccountId', e.target.value)} placeholder="Account ID"/>
                        </div>
                        <div className="ledger-filter">
                            <label htmlFor="ledgerInvoiceState">Invoice</label>
                            <select id="ledgerInvoiceState" value={filters.invoiceAssignment} onChange={(e) => updateFilter('invoiceAssignment', e.target.value)}>
                                <option value="all">Any state</option>
                                <option value="assigned">Assigned</option>
                                <option value="unassigned">Unassigned</option>
                            </select>
                        </div>
                        <div className="ledger-filter">
                            <label htmlFor="ledgerInvoiceId">Invoice ID</label>
                            <input id="ledgerInvoiceId" value={filters.invoiceId} onChange={(e) => updateFilter('invoiceId', e.target.value)} placeholder="Exact invoice ID"/>
                        </div>
                        <div className="ledger-filter ledger-filter-wide">
                            <label htmlFor="ledgerEntryId">Ledger Entry ID</label>
                            <input id="ledgerEntryId" value={filters.id} onChange={(e) => updateFilter('id', e.target.value)} placeholder="Exact ledger entry ID"/>
                        </div>
                        <div className="ledger-filter ledger-filter-wide">
                            <label htmlFor="ledgerChargeId">Charge ID</label>
                            <input id="ledgerChargeId" value={filters.chargeId} onChange={(e) => updateFilter('chargeId', e.target.value)} placeholder="Exact charge ID"/>
                        </div>
                        <div className="ledger-filter-actions">
                            <button type="submit" className="btn btn-primary" disabled={entriesLoading}>Apply</button>
                            <button type="button" className="btn btn-secondary" onClick={clearFilters} disabled={entriesLoading}>Clear</button>
                        </div>
                    </form>

                    {entriesLoading ? (
                        <div className="ledger-empty-state">Loading entries...</div>
                    ) : entries.length === 0 ? (
                        <div className="ledger-empty-state">No ledger entries found.</div>
                    ) : (
                        <div className="ledger-table-wrap">
                            <table className="ledger-table">
                                <thead>
                                <tr>
                                    <th>Service</th>
                                    <th>Subscriber</th>
                                    <th>Recorded</th>
                                    <th>Amount</th>
                                    <th>Participants</th>
                                    <th>Generated By</th>
                                    <th>Invoice</th>
                                </tr>
                                </thead>
                                <tbody>
                                {entries.map((entry) => (
                                    <tr key={entry.id} onClick={() => void fetchEntryDetails(entry.id)}>
                                        <td>
                                            <strong>{entry.subscriptionServiceName}</strong>
                                            <span>{entry.chargeDescription ?? entry.chargeId}</span>
                                        </td>
                                        <td>{entry.subscriberName}</td>
                                        <td>{formatMonth(entry.recordedMonth)}</td>
                                        <td>₴{Number(entry.amount).toFixed(2)}</td>
                                        <td>{entry.participantCount}</td>
                                        <td>{getActorName(entry.generatedByAccountName, entry.generatedByAccountId)}</td>
                                        <td>
                                            {entry.invoiceId ? (
                                                <span className="ledger-invoice-assigned">{entry.invoiceId}</span>
                                            ) : (
                                                <span className="ledger-invoice-unassigned">Unassigned</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {selectedEntry && (
                        <div className="ledger-detail">
                            <div className="ledger-pane-header">
                                <h3>Entry Details</h3>
                                {detailLoadingId && <span>Loading...</span>}
                            </div>
                            <div className="ledger-detail-grid">
                                <div><span>ID</span><strong>{selectedEntry.id}</strong></div>
                                <div><span>Service</span><strong>{selectedEntry.subscriptionServiceName}</strong></div>
                                <div><span>Subscriber</span><strong>{selectedEntry.subscriberName}</strong></div>
                                <div><span>Charge Month</span><strong>{formatMonth(selectedEntry.chargeMonth)}</strong></div>
                                <div><span>Recorded Month</span><strong>{formatMonth(selectedEntry.recordedMonth)}</strong></div>
                                <div><span>Amount</span><strong>₴{Number(selectedEntry.amount).toFixed(2)}</strong></div>
                                <div><span>Batch</span><strong>{selectedEntry.calculationBatchId}</strong></div>
                                <div><span>Batch Period</span><strong>{formatMonth(selectedEntry.calculationBatchFromMonth)} - {formatMonth(selectedEntry.calculationBatchToMonth)}</strong></div>
                                <div><span>Generated By</span><strong>{getActorName(selectedEntry.generatedByAccountName, selectedEntry.generatedByAccountId)}</strong></div>
                                <div><span>Invoice</span><strong>{selectedEntry.invoiceId ?? 'Unassigned'}</strong></div>
                                <div><span>Calculated At</span><strong>{formatTimestamp(selectedEntry.calculatedAt)}</strong></div>
                                <div><span>Notes</span><strong>{selectedEntry.notes ?? '—'}</strong></div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
