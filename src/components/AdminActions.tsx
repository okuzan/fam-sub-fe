import {useEffect, useState} from 'react';
import {API_CONFIG} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {useToast} from './Toast';
import type {
    AdminActionFilterRequest,
    AdminActionResponse,
    AdminActionTargetType,
    AdminActionType,
    RunRecoveryPreviewResponse,
    RunUndoRequest,
    RunUndoResponse
} from '../types/adminAction';
import {
    AdminActionTargetType as AdminActionTargetTypes,
    AdminActionType as AdminActionTypes
} from '../types/adminAction';

type AdminActionTab = 'all' | 'cost-runs' | 'invoice-runs';

type AdminActionFilterForm = {
    actionType: AdminActionType | '';
    targetType: AdminActionTargetType | '';
    targetId: string;
    subscriberId: string;
    createdByAccountId: string;
    dateFrom: string;
    dateTo: string;
    fromMonth: string;
    toMonth: string;
    limit: string;
};

const ACTION_LIMIT = 50;

const TAB_CONFIG: Record<AdminActionTab, { label: string; path: string }> = {
    all: {label: 'All Actions', path: ''},
    'cost-runs': {label: 'Cost Runs', path: '/cost-runs'},
    'invoice-runs': {label: 'Invoice Runs', path: '/invoice-runs'}
};

const ACTION_TYPE_OPTIONS = Object.values(AdminActionTypes);
const TARGET_TYPE_OPTIONS = Object.values(AdminActionTargetTypes);

const createInitialFilters = (): AdminActionFilterForm => ({
    actionType: '',
    targetType: '',
    targetId: '',
    subscriberId: '',
    createdByAccountId: '',
    dateFrom: '',
    dateTo: '',
    fromMonth: '',
    toMonth: '',
    limit: String(ACTION_LIMIT)
});

const toTitleCase = (value: string) =>
    value
        .split(' ')
        .filter(Boolean)
        .map((word) => {
            if (word.toUpperCase() === word) {
                return word;
            }

            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');

const formatEnumLabel = (value: string) => {
    if (!value) {
        return value;
    }

    if (value.includes('_')) {
        return value
            .toLowerCase()
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    if (value.includes('-')) {
        return toTitleCase(value.replace(/-/g, ' '));
    }

    // camelCase / PascalCase / mixed keys from BE, e.g. skippedCount -> Skipped Count
    const spaced = value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

    return toTitleCase(spaced);
};

const getActionTypeLabel = (type: AdminActionType) => {
    switch (type) {
        case 'COST_CALCULATION_RUN':
            return 'Cost Calculation Run';
        case 'COST_CALCULATION_RUN_UNDONE':
            return 'Cost Calculation Run Undone';
        case 'INVOICE_GENERATION_RUN':
            return 'Invoice Generation Run';
        case 'INVOICE_GENERATION_RUN_UNDONE':
            return 'Invoice Generation Run Undone';
        case 'INVOICE_VOIDED':
            return 'Invoice Voided';
        default:
            return formatEnumLabel(type);
    }
};

const getTargetTypeLabel = (targetType: AdminActionTargetType) => {
    switch (targetType) {
        case 'COST_CALCULATION_RUN':
            return 'Cost Calculation Run';
        case 'INVOICE_GENERATION_RUN':
            return 'Invoice Generation Run';
        default:
            return formatEnumLabel(targetType);
    }
};

const getActionTypeBadgeClass = (type: AdminActionType) => {
    switch (type) {
        case 'COST_CALCULATION_RUN':
            return 'admin-actions-badge admin-actions-badge-cost';
        case 'COST_CALCULATION_RUN_UNDONE':
            return 'admin-actions-badge admin-actions-badge-undone';
        case 'INVOICE_GENERATION_RUN':
            return 'admin-actions-badge admin-actions-badge-invoice';
        case 'INVOICE_GENERATION_RUN_UNDONE':
            return 'admin-actions-badge admin-actions-badge-undone';
        default:
            return 'admin-actions-badge';
    }
};

const formatMonth = (month: string) => {
    const date = new Date(month);
    return date.toLocaleDateString('en-US', {year: 'numeric', month: 'long'});
};

const formatPeriod = (fromMonth: string | null, toMonth: string | null) => {
    if (!fromMonth || !toMonth) {
        return 'Not period-based';
    }

    return `${formatMonth(fromMonth)} - ${formatMonth(toMonth)}`;
};

const formatTimestamp = (dateTime: string) =>
    new Date(dateTime).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

const toIsoString = (value: string) => {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const getPresetActionType = (tab: AdminActionTab): AdminActionType | undefined => {
    if (tab === 'cost-runs') {
        return 'COST_CALCULATION_RUN';
    }

    if (tab === 'invoice-runs') {
        return 'INVOICE_GENERATION_RUN';
    }

    return undefined;
};

const buildFilterRequest = (
    tab: AdminActionTab,
    filters: AdminActionFilterForm
): AdminActionFilterRequest => {
    const parsedLimit = Number.parseInt(filters.limit, 10);
    const presetActionType = getPresetActionType(tab);

    return {
        actionType: presetActionType ?? (filters.actionType || undefined),
        targetType: filters.targetType || undefined,
        targetId: filters.targetId.trim() || undefined,
        subscriberId: filters.subscriberId.trim() || undefined,
        createdByAccountId: filters.createdByAccountId.trim() || undefined,
        dateFrom: toIsoString(filters.dateFrom),
        dateTo: toIsoString(filters.dateTo),
        fromMonth: filters.fromMonth || undefined,
        toMonth: filters.toMonth || undefined,
        limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : ACTION_LIMIT
    };
};

const hasAdvancedFilters = (filters: AdminActionFilterRequest) =>
    Boolean(
        filters.targetType ||
        filters.targetId ||
        filters.subscriberId ||
        filters.createdByAccountId ||
        filters.dateFrom ||
        filters.dateTo ||
        filters.fromMonth ||
        filters.toMonth ||
        (filters.actionType && !['COST_CALCULATION_RUN', 'INVOICE_GENERATION_RUN'].includes(filters.actionType))
    );

const getMetricsRows = (action: AdminActionResponse) => {
    if (action.type === 'COST_CALCULATION_RUN') {
        return [
            {
                label: 'Ledger Entries Created',
                value: Number(action.metrics.ledgerEntriesCreated ?? 0).toLocaleString('en-US')
            },
            {
                label: 'Undone At',
                value: action.metrics.undoneAt ? formatTimestamp(String(action.metrics.undoneAt)) : 'Not undone'
            },
            {
                label: 'Undone By',
                value: action.metrics.undoneByAccountId ? String(action.metrics.undoneByAccountId) : '—'
            },
            {
                label: 'Undo Reason',
                value: action.metrics.undoReason ? String(action.metrics.undoReason) : '—'
            }
        ];
    }

    if (action.type === 'INVOICE_GENERATION_RUN') {
        return [
            {
                label: 'Invoices Created',
                value: Number(action.metrics.invoicesCreated ?? 0).toLocaleString('en-US')
            },
            {
                label: 'Ledger Entries Assigned',
                value: Number(action.metrics.ledgerEntriesAssigned ?? 0).toLocaleString('en-US')
            },
            {
                label: 'Total Amount',
                value: `₴${Number(action.metrics.totalAmount ?? 0).toFixed(2)}`
            },
            {
                label: 'Send Email',
                value: action.metrics.sendEmail ? 'Yes' : 'No'
            },
            {
                label: 'Undone At',
                value: action.metrics.undoneAt ? formatTimestamp(String(action.metrics.undoneAt)) : 'Not undone'
            },
            {
                label: 'Undone By',
                value: action.metrics.undoneByAccountId ? String(action.metrics.undoneByAccountId) : '—'
            },
            {
                label: 'Undo Reason',
                value: action.metrics.undoReason ? String(action.metrics.undoReason) : '—'
            }
        ];
    }

    return Object.entries(action.metrics).map(([label, value]) => ({
        label: formatEnumLabel(label),
        value: value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    }));
};

const getRecoveryRunType = (action: AdminActionResponse): 'cost-runs' | 'invoice-runs' | null => {
    if (action.type === 'COST_CALCULATION_RUN' || action.type === 'COST_CALCULATION_RUN_UNDONE') {
        return 'cost-runs';
    }

    if (action.type === 'INVOICE_GENERATION_RUN' || action.type === 'INVOICE_GENERATION_RUN_UNDONE') {
        return 'invoice-runs';
    }

    return null;
};

const formatRecoveryValue = (value: unknown) => {
    if (value == null) {
        return '—';
    }

    if (typeof value === 'number') {
        return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(2);
    }

    if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
};

export default function AdminActions() {
    const {showError, showSuccess} = useToast();
    const [selectedTab, setSelectedTab] = useState<AdminActionTab>('all');
    const [actions, setActions] = useState<AdminActionResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<AdminActionFilterForm>(createInitialFilters);
    const [previewLoadingRunId, setPreviewLoadingRunId] = useState<string | null>(null);
    const [undoLoadingRunId, setUndoLoadingRunId] = useState<string | null>(null);
    const [recoveryPreview, setRecoveryPreview] = useState<Record<string, RunRecoveryPreviewResponse>>({});
    const [undoReasons, setUndoReasons] = useState<Record<string, string>>({});

    useEffect(() => {
        void fetchActions(selectedTab, filters);
    }, [selectedTab]);

    const fetchActions = async (tab: AdminActionTab, currentFilters: AdminActionFilterForm) => {
        setLoading(true);

        try {
            const request = buildFilterRequest(tab, currentFilters);
            const limit = request.limit ?? ACTION_LIMIT;
            const presetActionType = getPresetActionType(tab);
            const shouldUseDirectEndpoint =
                !hasAdvancedFilters(request) &&
                !request.targetType &&
                !request.targetId &&
                !request.subscriberId &&
                !request.createdByAccountId &&
                !request.dateFrom &&
                !request.dateTo &&
                !request.fromMonth &&
                !request.toMonth &&
                (!request.actionType || request.actionType === presetActionType);

            let response: Response;

            if (tab === 'all' && shouldUseDirectEndpoint) {
                response = await fetch(`${API_CONFIG.ADMIN_ACTIONS_URL}?limit=${limit}`, {
                    credentials: 'include'
                });
            } else if (tab === 'cost-runs' && shouldUseDirectEndpoint) {
                response = await fetch(`${API_CONFIG.ADMIN_ACTIONS_URL}/cost-runs?limit=${limit}`, {
                    credentials: 'include'
                });
            } else if (tab === 'invoice-runs' && shouldUseDirectEndpoint) {
                response = await fetch(`${API_CONFIG.ADMIN_ACTIONS_URL}/invoice-runs?limit=${limit}`, {
                    credentials: 'include'
                });
            } else {
                response = await fetch(`${API_CONFIG.ADMIN_ACTIONS_URL}/filter`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    credentials: 'include',
                    body: JSON.stringify(request)
                });
            }

            if (response.ok) {
                const data = await response.json();
                setActions(Array.isArray(data) ? data : []);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch admin actions'));
            }
        } catch (err) {
            console.error('Failed to fetch admin actions:', err);
            showError('Error fetching admin actions');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (
        field: keyof AdminActionFilterForm,
        value: string
    ) => {
        setFilters((prev) => ({
            ...prev,
            [field]: value
        }));
    };

    const handleApplyFilters = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetchActions(selectedTab, filters);
    };

    const handleClearFilters = async () => {
        const clearedFilters = createInitialFilters();
        setFilters(clearedFilters);
        await fetchActions(selectedTab, clearedFilters);
    };

    const handlePreviewRecovery = async (action: AdminActionResponse) => {
        const runId = action.targetId;
        const runType = getRecoveryRunType(action);

        if (!runId || !runType) {
            return;
        }

        setPreviewLoadingRunId(runId);

        try {
            const response = await fetch(`${API_CONFIG.ADMIN_RECOVERY_URL}/${runType}/${runId}/preview`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data: RunRecoveryPreviewResponse = await response.json();
                setRecoveryPreview((prev) => ({
                    ...prev,
                    [runId]: data
                }));
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to load recovery preview'));
            }
        } catch (err) {
            console.error('Failed to fetch recovery preview:', err);
            showError('Error loading recovery preview');
        } finally {
            setPreviewLoadingRunId(null);
        }
    };

    const handleUndoRun = async (action: AdminActionResponse) => {
        const runId = action.targetId;
        const runType = getRecoveryRunType(action);

        if (!runId || !runType) {
            return;
        }

        setUndoLoadingRunId(runId);

        try {
            const reason = undoReasons[runId]?.trim();
            const requestBody: RunUndoRequest = reason ? {reason} : {};
            const response = await fetch(`${API_CONFIG.ADMIN_RECOVERY_URL}/${runType}/${runId}/undo`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(requestBody)
            });

            if (response.ok) {
                const data: RunUndoResponse = await response.json();
                showSuccess(data.summary || 'Run undone successfully');
                setRecoveryPreview((prev) => ({
                    ...prev,
                    [runId]: {
                        ...(prev[runId] ?? {
                            runId: data.runId,
                            type: data.type,
                            blockers: [],
                            effects: {}
                        }),
                        allowed: false,
                        alreadyUndone: true,
                        summary: data.summary,
                        effects: data.effects
                    }
                }));
                await fetchActions(selectedTab, filters);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to undo run'));
            }
        } catch (err) {
            console.error('Failed to undo run:', err);
            showError('Error undoing run');
        } finally {
            setUndoLoadingRunId(null);
        }
    };

    const lockedActionType = getPresetActionType(selectedTab);

    return (
        <div className="admin-actions">
            <div className="admin-actions-header">
                <h2>Admin Actions</h2>
                <p>Recent admin-side actions, including cost runs and invoice runs.</p>
            </div>

            <div className="admin-actions-tabs">
                {(Object.entries(TAB_CONFIG) as [AdminActionTab, {
                    label: string;
                    path: string
                }][]).map(([tab, config]) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setSelectedTab(tab)}
                        className={`admin-actions-tab ${selectedTab === tab ? 'admin-actions-tab-active' : ''}`}
                    >
                        {config.label}
                    </button>
                ))}
            </div>

            <form className="admin-actions-filters" onSubmit={handleApplyFilters}>
                <div className="admin-actions-filter">
                    <label htmlFor="adminActionType">Action Type</label>
                    <select
                        id="adminActionType"
                        value={lockedActionType ?? filters.actionType}
                        onChange={(e) => handleFilterChange('actionType', e.target.value)}
                        disabled={Boolean(lockedActionType)}
                    >
                        <option value="">All Action Types</option>
                        {ACTION_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>
                                {getActionTypeLabel(type)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminTargetType">Target Type</label>
                    <select
                        id="adminTargetType"
                        value={filters.targetType}
                        onChange={(e) => handleFilterChange('targetType', e.target.value)}
                    >
                        <option value="">All Target Types</option>
                        {TARGET_TYPE_OPTIONS.map((targetType) => (
                            <option key={targetType} value={targetType}>
                                {getTargetTypeLabel(targetType)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminTargetId">Target ID</label>
                    <input
                        id="adminTargetId"
                        type="text"
                        value={filters.targetId}
                        onChange={(e) => handleFilterChange('targetId', e.target.value)}
                        placeholder="uuid"
                    />
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminSubscriberId">Subscriber ID</label>
                    <input
                        id="adminSubscriberId"
                        type="text"
                        value={filters.subscriberId}
                        onChange={(e) => handleFilterChange('subscriberId', e.target.value)}
                        placeholder="uuid"
                    />
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminCreatedByAccountId">Created By Account ID</label>
                    <input
                        id="adminCreatedByAccountId"
                        type="text"
                        value={filters.createdByAccountId}
                        onChange={(e) => handleFilterChange('createdByAccountId', e.target.value)}
                        placeholder="uuid"
                    />
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminDateFrom">Created From</label>
                    <input
                        id="adminDateFrom"
                        type="datetime-local"
                        value={filters.dateFrom}
                        onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    />
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminDateTo">Created To</label>
                    <input
                        id="adminDateTo"
                        type="datetime-local"
                        value={filters.dateTo}
                        onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    />
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminFromMonth">From Month</label>
                    <input
                        id="adminFromMonth"
                        type="month"
                        value={filters.fromMonth}
                        onChange={(e) => handleFilterChange('fromMonth', e.target.value)}
                    />
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminToMonth">To Month</label>
                    <input
                        id="adminToMonth"
                        type="month"
                        value={filters.toMonth}
                        onChange={(e) => handleFilterChange('toMonth', e.target.value)}
                    />
                </div>

                <div className="admin-actions-filter">
                    <label htmlFor="adminLimit">Limit</label>
                    <input
                        id="adminLimit"
                        type="number"
                        min="1"
                        value={filters.limit}
                        onChange={(e) => handleFilterChange('limit', e.target.value)}
                    />
                </div>

                <div className="admin-actions-filter-actions">
                    <button type="submit" className="admin-actions-submit" disabled={loading}>
                        {loading ? 'Applying...' : 'Apply Filters'}
                    </button>
                    <button type="button" className="admin-actions-reset" onClick={handleClearFilters}
                            disabled={loading}>
                        Clear
                    </button>
                </div>
            </form>

            {loading ? (
                <div className="admin-actions-empty">Loading admin actions...</div>
            ) : actions.length === 0 ? (
                <div className="admin-actions-empty">No admin actions found.</div>
            ) : (
                <div className="admin-actions-list">
                    {actions.map((action) => (
                        <div key={action.id} className="admin-actions-card">
                            <div className="admin-actions-card-header">
                                <span className={getActionTypeBadgeClass(action.type)}>
                                    {getActionTypeLabel(action.type)}
                                </span>
                                <span className="admin-actions-created-at">{formatTimestamp(action.createdAt)}</span>
                            </div>

                            <p className="admin-actions-summary">{action.summary}</p>

                            <div className="admin-actions-meta">
                                <p><strong>Target Type:</strong> {getTargetTypeLabel(action.targetType)}</p>
                                <p><strong>Period:</strong> {formatPeriod(action.fromMonth, action.toMonth)}</p>
                                <p><strong>Created By:</strong> {action.createdByAccountId}</p>
                                {action.targetId && <p><strong>Target ID:</strong> {action.targetId}</p>}
                                {action.subscriberId && <p><strong>Subscriber ID:</strong> {action.subscriberId}</p>}
                                <p><strong>Action ID:</strong> {action.id}</p>
                            </div>

                            <div className="admin-actions-metrics">
                                {getMetricsRows(action).map((metric) => (
                                    <div key={metric.label} className="admin-actions-metric">
                                        <span className="admin-actions-metric-label">{metric.label}</span>
                                        <span className="admin-actions-metric-value">{metric.value}</span>
                                    </div>
                                ))}
                            </div>

                            {action.targetId && getRecoveryRunType(action) && (
                                <div className="admin-actions-recovery">
                                    <div className="admin-actions-recovery-actions">
                                        <button
                                            type="button"
                                            className="admin-actions-reset"
                                            onClick={() => handlePreviewRecovery(action)}
                                            disabled={previewLoadingRunId === action.targetId}
                                        >
                                            {previewLoadingRunId === action.targetId ? 'Loading...' : 'Preview Undo'}
                                        </button>
                                    </div>

                                    {recoveryPreview[action.targetId] && (
                                        <div className="admin-actions-recovery-panel">
                                            <p><strong>Recovery Type:</strong> {recoveryPreview[action.targetId].type}
                                            </p>
                                            <p>
                                                <strong>Allowed:</strong> {recoveryPreview[action.targetId].allowed ? 'Yes' : 'No'}
                                            </p>
                                            <p><strong>Already
                                                Undone:</strong> {recoveryPreview[action.targetId].alreadyUndone ? 'Yes' : 'No'}
                                            </p>
                                            <p><strong>Summary:</strong> {recoveryPreview[action.targetId].summary}</p>

                                            {recoveryPreview[action.targetId].blockers.length > 0 && (
                                                <div className="admin-actions-recovery-blockers">
                                                    <strong>Blockers</strong>
                                                    <ul>
                                                        {recoveryPreview[action.targetId].blockers.map((blocker) => (
                                                            <li key={blocker}>{blocker}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="admin-actions-recovery-effects">
                                                {Object.entries(recoveryPreview[action.targetId].effects).map(([label, value]) => (
                                                    <div key={label} className="admin-actions-metric">
                                                        <span
                                                            className="admin-actions-metric-label">{formatEnumLabel(label)}</span>
                                                        <span
                                                            className="admin-actions-metric-value">{formatRecoveryValue(value)}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <label className="admin-actions-recovery-reason">
                                                <span>Undo Reason</span>
                                                <textarea
                                                    value={undoReasons[action.targetId] ?? ''}
                                                    onChange={(e) => setUndoReasons((prev) => ({
                                                        ...prev,
                                                        [action.targetId as string]: e.target.value
                                                    }))}
                                                    placeholder="Optional reason for undo"
                                                    rows={3}
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                className="admin-actions-submit"
                                                onClick={() => handleUndoRun(action)}
                                                disabled={
                                                    undoLoadingRunId === action.targetId ||
                                                    !recoveryPreview[action.targetId].allowed ||
                                                    recoveryPreview[action.targetId].alreadyUndone
                                                }
                                            >
                                                {undoLoadingRunId === action.targetId ? 'Undoing...' : 'Undo Run'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
