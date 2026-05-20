import {useEffect, useState} from 'react';
import {API_CONFIG} from '../config/api';
import {useToast} from './Toast';
import type {
    AdminActionFilterRequest,
    AdminActionResponse,
    AdminActionTargetType,
    AdminActionType
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

const TAB_CONFIG: Record<AdminActionTab, {label: string; path: string}> = {
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

const formatEnumLabel = (value: string) =>
    value
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

const getActionTypeLabel = (type: AdminActionType) => {
    switch (type) {
        case 'COST_CALCULATION_RUN':
            return 'Cost Calculation Run';
        case 'INVOICE_GENERATION_RUN':
            return 'Invoice Generation Run';
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
        case 'INVOICE_GENERATION_RUN':
            return 'admin-actions-badge admin-actions-badge-invoice';
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
            }
        ];
    }

    return Object.entries(action.metrics).map(([label, value]) => ({
        label: formatEnumLabel(label),
        value: typeof value === 'object' ? JSON.stringify(value) : String(value)
    }));
};

export default function AdminActions() {
    const {showError} = useToast();
    const [selectedTab, setSelectedTab] = useState<AdminActionTab>('all');
    const [actions, setActions] = useState<AdminActionResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<AdminActionFilterForm>(createInitialFilters);

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
                showError('Failed to fetch admin actions');
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

    const lockedActionType = getPresetActionType(selectedTab);

    return (
        <div className="admin-actions">
            <div className="admin-actions-header">
                <h2>Admin Actions</h2>
                <p>Recent admin-side actions, including cost runs and invoice runs.</p>
            </div>

            <div className="admin-actions-tabs">
                {(Object.entries(TAB_CONFIG) as [AdminActionTab, {label: string; path: string}][]).map(([tab, config]) => (
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
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
