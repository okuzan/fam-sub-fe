import {useEffect, useState} from 'react';
import {API_CONFIG} from '../config/api';
import {useToast} from './Toast';
import type {AdminActionResponse, AdminActionType} from '../types/adminAction';

type AdminActionTab = 'all' | 'cost-runs' | 'invoice-runs';

const ACTION_LIMIT = 50;

const TAB_CONFIG: Record<AdminActionTab, {label: string; path: string}> = {
    all: {label: 'All Actions', path: ''},
    'cost-runs': {label: 'Cost Runs', path: '/cost-runs'},
    'invoice-runs': {label: 'Invoice Runs', path: '/invoice-runs'}
};

const getActionTypeLabel = (type: AdminActionType) => {
    switch (type) {
        case 'COST_CALCULATION_RUN':
            return 'Cost Calculation Run';
        case 'INVOICE_GENERATION_RUN':
            return 'Invoice Generation Run';
        default:
            return type;
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

const formatTimestamp = (dateTime: string) =>
    new Date(dateTime).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

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
        label,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value)
    }));
};

export default function AdminActions() {
    const {showError} = useToast();
    const [selectedTab, setSelectedTab] = useState<AdminActionTab>('all');
    const [actions, setActions] = useState<AdminActionResponse[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchActions(selectedTab);
    }, [selectedTab]);

    const fetchActions = async (tab: AdminActionTab) => {
        setLoading(true);

        try {
            const tabPath = TAB_CONFIG[tab].path;
            const response = await fetch(`${API_CONFIG.ADMIN_ACTIONS_URL}${tabPath}?limit=${ACTION_LIMIT}`, {
                credentials: 'include'
            });

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

    return (
        <div className="admin-actions">
            <div className="admin-actions-header">
                <h2>Admin Actions</h2>
                <p>Recent cost calculation and invoice generation runs.</p>
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
                                <p><strong>Period:</strong> {formatMonth(action.fromMonth)} - {formatMonth(action.toMonth)}</p>
                                <p><strong>Created By:</strong> {action.createdByAccountId}</p>
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
