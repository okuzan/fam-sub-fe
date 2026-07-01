import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {API_CONFIG} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {useEscapeClose} from '../utils/useEscapeClose';
import {useToast} from './ToastContext';
import type {
    SubscriberCreateRequest,
    SubscriberResponse,
    SubscriberUpdateRequest,
    SubscriberDetailResponse,
    SubscriberDebtPaymentResult
} from '../types/subscriber';

export default function Subscribers() {
    const {showError, showSuccess} = useToast();
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingSubscriber, setEditingSubscriber] = useState<SubscriberResponse | null>(null);
    const [selectedSubscriber, setSelectedSubscriber] = useState<SubscriberDetailResponse | null>(null);
    const [debtPaymentResult, setDebtPaymentResult] = useState<SubscriberDebtPaymentResult | null>(null);
    const [payingOffDebt, setPayingOffDebt] = useState(false);
    const [formData, setFormData] = useState({name: '', email: '', balance: '', autoPayInvoices: false});
    const [searchName, setSearchName] = useState('');
    const [showOnlyDebtors, setShowOnlyDebtors] = useState(false);

    const parseCreditBalance = () => {
        if (!formData.balance) {
            return 0;
        }

        const creditBalance = parseFloat(formData.balance);
        return Number.isFinite(creditBalance) ? creditBalance : 0;
    };

    useEffect(() => {
        fetchSubscribers();
    }, []);

    useEffect(() => {
        const handleSubscriberRefresh = () => {
            fetchSubscribers();
        };

        const customEventListener = () => {
            handleSubscriberRefresh();
        };

        window.addEventListener('subscriber-refresh-needed', customEventListener);
        return () => window.removeEventListener('subscriber-refresh-needed', customEventListener);
    }, []);

    const fetchSubscribers = async (namePrefix?: string, onlyDebtors?: boolean) => {
        try {
            let url: string = API_CONFIG.SUBSCRIBERS_URL;
            const params = new URLSearchParams();

            if (onlyDebtors) {
                url = `${API_CONFIG.SUBSCRIBERS_URL}/debtors`;
            } else if (namePrefix) {
                params.append('namePrefix', namePrefix);
            }

            const finalUrl = params.toString() ? `${url}?${params.toString()}` : url;

            const response = await fetch(finalUrl, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSubscribers(data);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch subscribers'));
            }
        } catch (err) {
            console.error(err);
            showError('Error fetching subscribers');
        } finally {
            setLoading(false);
        }
    };

    const fetchSubscriberDetails = async (subscriberId: string) => {
        try {
            const response = await fetch(`${API_CONFIG.SUBSCRIBERS_URL}/${subscriberId}/details`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSelectedSubscriber(data);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch subscriber details'));
            }
        } catch (err) {
            console.error(err);
            showError('Error fetching subscriber details');
        }
    };

    const openSubscriberDetails = async (subscriberId: string) => {
        setDebtPaymentResult(null);
        await fetchSubscriberDetails(subscriberId);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const creditBalance = parseCreditBalance();
            if (creditBalance < 0) {
                showError('Credit balance cannot be negative. Use a manual invoice to record debt.');
                return;
            }

            const request: SubscriberCreateRequest = {
                name: formData.name,
                email: formData.email,
                balance: creditBalance,
                autoPayInvoices: formData.autoPayInvoices
            };

            const response = await fetch(API_CONFIG.SUBSCRIBERS_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchSubscribers();
                setShowCreateForm(false);
                setFormData({name: '', email: '', balance: '', autoPayInvoices: false});
                showSuccess('Subscriber created successfully');
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to create subscriber'));
            }
        } catch (err) {
            console.error(err);
            showError('Error creating subscriber');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSubscriber) return;

        try {
            const creditBalance = parseCreditBalance();
            if (creditBalance < 0) {
                showError('Credit balance cannot be negative. Use a manual invoice to record debt.');
                return;
            }

            const request: SubscriberUpdateRequest = {
                name: formData.name,
                email: formData.email,
                balance: creditBalance,
                autoPayInvoices: formData.autoPayInvoices
            };

            const response = await fetch(`${API_CONFIG.SUBSCRIBERS_URL}/${editingSubscriber.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchSubscribers();
                setEditingSubscriber(null);
                setFormData({name: '', email: '', balance: '', autoPayInvoices: false});
                showSuccess('Subscriber updated successfully');
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to update subscriber'));
            }
        } catch (err) {
            console.error(err);
            showError('Error updating subscriber');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this subscriber?')) return;

        try {
            const response = await fetch(`${API_CONFIG.SUBSCRIBERS_URL}/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                await fetchSubscribers();
                showSuccess('Subscriber deleted successfully');
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to delete subscriber'));
            }
        } catch (err) {
            console.error(err);
            showError('Error deleting subscriber');
        }
    };

    const handleEmailSubscriberSituation = async (subscriberId: string, subscriberName: string) => {
        setLoading(true);

        try {
            const response = await fetch(`${API_CONFIG.SUBSCRIBERS_URL}/${subscriberId}/email-situation`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                showSuccess(`Email sent to ${subscriberName}: ${result.message || 'Situation email sent successfully'}`);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to send situation email'));
            }
        } catch (err) {
            console.error(err);
            showError('Error sending situation email');
        } finally {
            setLoading(false);
        }
    };

    const handlePayOffDebt = async () => {
        if (!selectedSubscriber) return;

        const payableInvoices = selectedSubscriber.unpaidInvoices.filter((invoice) =>
            ['DRAFT', 'SENT'].includes(invoice.status)
        );

        if (payableInvoices.length === 0) {
            showError('No draft or sent invoices are available to pay off.');
            return;
        }

        if (!confirm(`Mark ${payableInvoices.length} pending invoice(s) for ${selectedSubscriber.name} as paid?`)) {
            return;
        }

        const includeCredit = selectedSubscriber.balance > 0
            ? confirm(
                `${selectedSubscriber.name} has ₴${selectedSubscriber.balance.toFixed(2)} in credit. ` +
                'Clear this credit balance as part of the payoff? Press Cancel to keep the credit.'
            )
            : true;

        setPayingOffDebt(true);
        setDebtPaymentResult(null);

        try {
            const response = await fetch(`${API_CONFIG.SUBSCRIBERS_URL}/${selectedSubscriber.id}/pay-off-debt?includeCredit=${includeCredit}`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const result: SubscriberDebtPaymentResult = await response.json();
                setDebtPaymentResult(result);
                const creditMessage = result.creditWrittenOff > 0
                    ? ` Credit written off: ₴${result.creditWrittenOff.toFixed(2)}.`
                    : '';
                showSuccess(
                    `Paid ${result.paidCount} invoice(s) for ${result.subscriberName}, totaling ₴${result.totalPaidAmount.toFixed(2)}.${creditMessage}`
                );

                await fetchSubscribers(searchName.trim() || undefined, showOnlyDebtors);
                await fetchSubscriberDetails(selectedSubscriber.id);
                window.dispatchEvent(new CustomEvent('invoice-refresh-needed'));
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to pay off subscriber debt'));
            }
        } catch (err) {
            console.error('Error paying off subscriber debt:', err);
            showError('Error paying off subscriber debt');
        } finally {
            setPayingOffDebt(false);
        }
    };

    const handleSearchChange = (value: string) => {
        setSearchName(value);
        if (showOnlyDebtors) {
            // If debtors filter is on, don't apply name search yet
            return;
        }
        // Debounced search
        const timeoutId = setTimeout(() => {
            setLoading(true);
            fetchSubscribers(value.trim() || undefined, false);
        }, 300);
        return () => clearTimeout(timeoutId);
    };

    const handleDebtorToggle = (checked: boolean) => {
        setShowOnlyDebtors(checked);
        setLoading(true);
        if (checked) {
            fetchSubscribers(undefined, true);
        } else {
            fetchSubscribers(searchName.trim() || undefined, false);
        }
    };

    const openEditForm = (subscriber: SubscriberResponse) => {
        setEditingSubscriber(subscriber);
        setFormData({
            name: subscriber.name,
            email: subscriber.email,
            balance: subscriber.balance.toString(),
            autoPayInvoices: subscriber.autoPayInvoices
        });
        setShowCreateForm(false);
    };

    const openCreateForm = () => {
        setEditingSubscriber(null);
        setFormData({name: '', email: '', balance: '', autoPayInvoices: false});
        setShowCreateForm(true);
    };

    const closeForm = () => {
        setShowCreateForm(false);
        setEditingSubscriber(null);
        setFormData({name: '', email: '', balance: '', autoPayInvoices: false});
    };

    useEscapeClose(showCreateForm || Boolean(editingSubscriber), closeForm);
    useEscapeClose(Boolean(selectedSubscriber), () => {
        if (!payingOffDebt) {
            setSelectedSubscriber(null);
        }
    });

    if (loading) return <div className="loading">Loading subscribers...</div>;

    return (
        <>
            <div className="subscribers">
                <div className="subscribers-header">
                    <div className="header-content">
                        <h2>Subscribers</h2>
                        <div className="header-controls">
                            <div className="search-container">
                                <input
                                    type="text"
                                    placeholder="Search by name..."
                                    value={searchName}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="search-input"
                                    disabled={showOnlyDebtors}
                                />
                            </div>
                            <div className="debtor-toggle">
                                <label className="toggle-label">
                                    <input
                                        type="checkbox"
                                        checked={showOnlyDebtors}
                                        onChange={(e) => handleDebtorToggle(e.target.checked)}
                                        className="toggle-input"
                                    />
                                    <span className="toggle-slider"></span>
                                    <span className="toggle-text">Only Debtors</span>
                                </label>
                            </div>
                            <button onClick={openCreateForm} className="btn btn-primary">
                                Add New Subscriber
                            </button>
                        </div>
                    </div>
                </div>

                <div className="subscribers-list">
                    {subscribers.length === 0 ? (
                        <div className="empty-state">
                            <p>No subscribers found. Create your first subscriber!</p>
                        </div>
                    ) : (
                        <div className="subscribers-grid">
                            {subscribers.map((subscriber) => (
                                <div key={subscriber.id} className="subscriber-card">
                                    <div className="subscriber-info">
                                        <h3>{subscriber.name}</h3>
                                        <p className="email">{subscriber.email}</p>
                                        <p className="balance">
                                            {subscriber.balance < 0 ? 'Legacy balance debt' : 'Credit balance'}: ₴{Math.abs(subscriber.balance).toFixed(2)}
                                        </p>
                                        <p className={`auto-pay ${subscriber.autoPayInvoices ? 'enabled' : ''}`}>
                                            Auto-pay invoices: {subscriber.autoPayInvoices ? 'On' : 'Off'}
                                        </p>
                                        <p className="date">Created: {new Date(subscriber.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="subscriber-actions">
                                        <button onClick={() => openSubscriberDetails(subscriber.id)}
                                                className="btn btn-sm btn-info">
                                            Info
                                        </button>
                                        <button onClick={() => openEditForm(subscriber)}
                                                className="btn btn-sm btn-secondary">
                                            Edit
                                        </button>
                                        <button onClick={() => handleDelete(subscriber.id)}
                                                className="btn btn-sm btn-danger">
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {(showCreateForm || editingSubscriber) && createPortal(
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>{editingSubscriber ? 'Edit Subscriber' : 'Create New Subscriber'}</h3>
                        <form onSubmit={editingSubscriber ? handleUpdate : handleCreate}>
                            <div className="form-group">
                                <label htmlFor="name">Name</label>
                                <input
                                    type="text"
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="email">Email</label>
                                <input
                                    type="email"
                                    id="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="balance">Credit Balance (UAH)</label>
                                <input
                                    type="number"
                                    id="balance"
                                    step="1"
                                    min="0"
                                    value={formData.balance}
                                    onChange={(e) => setFormData({...formData, balance: e.target.value})}
                                    placeholder="0"
                                />
                            </div>
                            <div className="form-group checkbox-group">
                                <label className="checkbox-label" htmlFor="autoPayInvoices">
                                    <input
                                        type="checkbox"
                                        id="autoPayInvoices"
                                        checked={formData.autoPayInvoices}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            autoPayInvoices: e.target.checked
                                        })}
                                    />
                                    <span>Auto-pay invoices</span>
                                </label>
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-success">
                                    {editingSubscriber ? 'Update' : 'Create'}
                                </button>
                                <button type="button" onClick={closeForm} className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
            {selectedSubscriber && createPortal(
                <div className="form-overlay">
                    <div className="form-container subscriber-detail">
                        <h3>Subscriber Details</h3>
                        <div className="subscriber-detail-info">
                            <h4>{selectedSubscriber.name}</h4>
                            <p><strong>Email:</strong> {selectedSubscriber.email}</p>
                            <p>
                                <strong>{selectedSubscriber.balance < 0 ? 'Legacy balance debt' : 'Credit balance'}:</strong>{' '}
                                ₴{Math.abs(selectedSubscriber.balance).toFixed(2)}
                            </p>
                            <p><strong>Auto-pay invoices:</strong> {selectedSubscriber.autoPayInvoices ? 'On' : 'Off'}</p>
                            <p><strong>Total Amount Owed:</strong> ₴{selectedSubscriber.totalAmountOwed.toFixed(2)}</p>
                        </div>

                        <h5>Active Subscriptions ({selectedSubscriber.activeSubscriptions.length})</h5>
                        <div className="active-subscriptions">
                            {selectedSubscriber.activeSubscriptions.length === 0 ? (
                                <p>No active subscriptions</p>
                            ) : (
                                selectedSubscriber.activeSubscriptions.map((subscription) => (
                                    <div key={subscription.id} className="subscription-card">
                                        <p><strong>Service:</strong> {subscription.serviceName}</p>
                                        <p><strong>Price:</strong> ₴{subscription.servicePrice.toFixed(2)}</p>
                                        <p>
                                            <strong>Period:</strong> {subscription.startMonth} - {subscription.endMonth || 'Ongoing'}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>

                        <h5>Unpaid Invoices ({selectedSubscriber.unpaidInvoices.length})</h5>
                        <div className="unpaid-invoices">
                            {selectedSubscriber.unpaidInvoices.length === 0 ? (
                                <p>No unpaid invoices</p>
                            ) : (
                                selectedSubscriber.unpaidInvoices.map((invoice) => (
                                    <div key={invoice.id} className="unpaid-invoice-card">
                                        <p><strong>Amount:</strong> ₴{invoice.totalAmount.toFixed(2)}</p>
                                        {invoice.origin === 'SUBSCRIPTION_LEDGER' && (
                                            <p><strong>Period:</strong> {invoice.fromMonth} - {invoice.toMonth}</p>
                                        )}
                                        <p><strong>Invoice date:</strong> {new Date(`${invoice.invoiceDate}T00:00:00`).toLocaleDateString()}</p>
                                        <p><strong>Status:</strong> {invoice.status}</p>
                                        <p><strong>Created:</strong> {new Date(invoice.createdAt).toLocaleDateString()}
                                        </p>
                                        {invoice.notes && <p><strong>Notes:</strong> {invoice.notes}</p>}
                                    </div>
                                ))
                            )}
                        </div>

                        {debtPaymentResult && (
                            <div className="debt-payment-result">
                                <div className="debt-payment-summary">
                                    <strong>Debt payment result</strong>
                                    <span>
                                        Paid {debtPaymentResult.paidCount} of {debtPaymentResult.attemptedCount} invoice(s),
                                        total ₴{debtPaymentResult.totalPaidAmount.toFixed(2)}.
                                        Credit written off: ₴{debtPaymentResult.creditWrittenOff.toFixed(2)}.
                                        Balance: ₴{debtPaymentResult.balanceAfter.toFixed(2)}.
                                    </span>
                                </div>
                                {debtPaymentResult.items.length > 0 && (
                                    <div className="debt-payment-items">
                                        <div className="debt-payment-header">
                                            <span>Invoice</span>
                                            <span>Status</span>
                                            <span>Amount</span>
                                            <span>Result</span>
                                        </div>
                                        {debtPaymentResult.items.map((item) => (
                                            <div key={item.invoiceId} className="debt-payment-row">
                                                <span title={item.invoiceId}>{item.invoiceId}</span>
                                                <span>{item.statusBefore} &rarr; {item.statusAfter}</span>
                                                <span>₴{item.invoiceAmount.toFixed(2)}</span>
                                                <span className={`debt-payment-badge ${item.paid ? 'paid' : 'skipped'}`}>
                                                    {item.paid ? 'Paid' : item.message}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="form-actions">
                            <button
                                onClick={handlePayOffDebt}
                                className="btn btn-success"
                                disabled={payingOffDebt || selectedSubscriber.unpaidInvoices.every((invoice) => !['DRAFT', 'SENT'].includes(invoice.status))}
                            >
                                {payingOffDebt ? 'Paying...' : 'Pay Off Debt'}
                            </button>
                            <button
                                onClick={() => handleEmailSubscriberSituation(selectedSubscriber.id, selectedSubscriber.name)}
                                className="btn btn-primary"
                                disabled={loading || payingOffDebt}
                            >
                                {loading ? 'Sending...' : '📧 Email Situation'}
                            </button>
                            <button onClick={() => setSelectedSubscriber(null)} className="btn btn-secondary" disabled={payingOffDebt}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </>
    );
}
