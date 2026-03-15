import {useEffect, useState} from 'react';
import {API_CONFIG} from '../config/api';
import type {SubscriberCreateRequest, SubscriberResponse, SubscriberUpdateRequest} from '../types/subscriber';
import type {OutstandingBalanceInvoiceRequest} from '../types/invoice';

export default function Subscribers() {
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingSubscriber, setEditingSubscriber] = useState<SubscriberResponse | null>(null);
    const [formData, setFormData] = useState({name: '', email: '', balance: ''});

    useEffect(() => {
        fetchSubscribers();
    }, []);

    const fetchSubscribers = async () => {
        try {
            const response = await fetch(API_CONFIG.SUBSCRIBERS_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSubscribers(data);
            } else {
                setError('Failed to fetch subscribers');
            }
        } catch (err) {
            console.error(err);
            setError('Error fetching subscribers');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            const request: SubscriberCreateRequest = {
                name: formData.name,
                email: formData.email,
                balance: formData.balance ? parseFloat(formData.balance) : 0
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
                setFormData({name: '', email: '', balance: ''});
            } else {
                setError('Failed to create subscriber');
            }
        } catch (err) {
            console.error(err);
            setError('Error creating subscriber');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSubscriber) return;

        try {
            const request: SubscriberUpdateRequest = {
                name: formData.name,
                email: formData.email,
                balance: parseFloat(formData.balance)
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
                setFormData({name: '', email: '', balance: ''});
            } else {
                setError('Failed to update subscriber');
            }
        } catch (err) {
            console.error(err);
            setError('Error updating subscriber');
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
            } else {
                setError('Failed to delete subscriber');
            }
        } catch (err) {
            console.error(err);
            setError('Error deleting subscriber');
        }
    };

    const handleGenerateOutstandingBalanceInvoice = async (subscriberId: string, subscriberName: string) => {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const request: OutstandingBalanceInvoiceRequest = {
                subscriberId: subscriberId
            };

            const response = await fetch(`${API_CONFIG.INVOICES_URL}/outstanding-balance`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                const invoice = await response.json();
                setSuccess(`Generated outstanding balance invoice for ${subscriberName} totaling $${invoice.totalAmount.toFixed(2)}`);
                // Refresh subscribers to show updated balance (should be 0)
                fetchSubscribers();
                // Trigger invoice refresh in Invoices component using custom event
                window.dispatchEvent(new CustomEvent('invoice-refresh-needed'));
            } else {
                setError('Failed to generate outstanding balance invoice');
            }
        } catch (err) {
            console.error(err);
            setError('Error generating outstanding balance invoice');
        } finally {
            setLoading(false);
        }
    };

    const openEditForm = (subscriber: SubscriberResponse) => {
        setEditingSubscriber(subscriber);
        setFormData({name: subscriber.name, email: subscriber.email, balance: subscriber.balance.toString()});
        setShowCreateForm(false);
    };

    const openCreateForm = () => {
        setEditingSubscriber(null);
        setFormData({name: '', email: '', balance: ''});
        setShowCreateForm(true);
    };

    const closeForm = () => {
        setShowCreateForm(false);
        setEditingSubscriber(null);
        setFormData({name: '', email: '', balance: ''});
    };

    if (loading) return <div className="loading">Loading subscribers...</div>;

    return (
        <div className="subscribers">
            <div className="subscribers-header">
                <h2>Subscribers</h2>
                <button onClick={openCreateForm} className="btn btn-primary">
                    Add New Subscriber
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            {(showCreateForm || editingSubscriber) && (
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
                                <label htmlFor="balance">Balance</label>
                                <input
                                    type="number"
                                    id="balance"
                                    step="1"
                                    min="0"
                                    value={formData.balance}
                                    onChange={(e) => setFormData({...formData, balance: e.target.value})}
                                    placeholder="0.00"
                                />
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
                </div>
            )}

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
                                    <p className="balance">Balance: ${subscriber.balance.toFixed(2)}</p>
                                    <p className="date">Created: {new Date(subscriber.createdAt).toLocaleDateString()}</p>
                                </div>
                                <div className="subscriber-actions">
                                    <button onClick={() => openEditForm(subscriber)}
                                            className="btn btn-sm btn-secondary">
                                        Edit
                                    </button>
                                    {subscriber.balance < 0 && (
                                        <button
                                            onClick={() => handleGenerateOutstandingBalanceInvoice(subscriber.id, subscriber.name)}
                                            className="btn btn-sm btn-warning"
                                            disabled={loading}
                                        >
                                            Invoice Outstanding Balance
                                        </button>
                                    )}
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
    );
}
