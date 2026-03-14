import {useEffect, useState} from 'react';
import {API_CONFIG} from '../config/api';
import type {
    ChargeCreateRequest,
    ChargeResponse,
    ChargeUpdateRequest
} from '../types/charge';
import type {SubscriptionServiceResponse} from '../types/subscription';

export default function Charges() {
    const [charges, setCharges] = useState<ChargeResponse[]>([]);
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingCharge, setEditingCharge] = useState<ChargeResponse | null>(null);
    const [selectedService, setSelectedService] = useState<string>('');
    const [formData, setFormData] = useState({
        subscriptionServiceId: '',
        amount: '',
        chargeDate: ''
    });

    useEffect(() => {
        fetchServices();
    }, []);

    useEffect(() => {
        if (selectedService) {
            fetchChargesByService(selectedService);
        } else {
            setCharges([]);
        }
    }, [selectedService]);

    const fetchServices = async () => {
        try {
            const response = await fetch(API_CONFIG.SUBSCRIPTION_SERVICES_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setServices(data);
            } else {
                setError('Failed to fetch services');
            }
        } catch (err) {
            console.error(err);
            setError('Error fetching services');
        }
    };

    const fetchChargesByService = async (serviceId: string) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_CONFIG.CHARGES_URL}/service/${serviceId}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setCharges(data);
            } else {
                setError('Failed to fetch charges');
            }
        } catch (err) {
            console.error(err);
            setError('Error fetching charges');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            const request: ChargeCreateRequest = {
                subscriptionServiceId: formData.subscriptionServiceId,
                amount: parseFloat(formData.amount),
                chargeDate: formData.chargeDate
            };

            const response = await fetch(API_CONFIG.CHARGES_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchChargesByService(formData.subscriptionServiceId);
                setShowCreateForm(false);
                setFormData({subscriptionServiceId: '', amount: '', chargeDate: ''});
            } else {
                setError('Failed to create charge');
            }
        } catch (err) {
            console.error(err);
            setError('Error creating charge');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingCharge) return;

        try {
            const request: ChargeUpdateRequest = {
                amount: parseFloat(formData.amount)
            };

            const response = await fetch(`${API_CONFIG.CHARGES_URL}/${editingCharge.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchChargesByService(editingCharge.subscriptionServiceId);
                setEditingCharge(null);
                setFormData({subscriptionServiceId: '', amount: '', chargeDate: ''});
            } else {
                setError('Failed to update charge');
            }
        } catch (err) {
            console.error(err);
            setError('Error updating charge');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this charge?')) return;

        try {
            const response = await fetch(`${API_CONFIG.CHARGES_URL}/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                await fetchChargesByService(selectedService);
            } else {
                setError('Failed to delete charge');
            }
        } catch (err) {
            console.error(err);
            setError('Error deleting charge');
        }
    };

    const openEditForm = (charge: ChargeResponse) => {
        setEditingCharge(charge);
        setFormData({
            subscriptionServiceId: charge.subscriptionServiceId,
            amount: charge.amount.toString(),
            chargeDate: charge.chargeDate
        });
        setShowCreateForm(false);
    };

    const openCreateForm = () => {
        setEditingCharge(null);
        setFormData({
            subscriptionServiceId: selectedService,
            amount: '',
            chargeDate: new Date().toISOString().slice(0, 7) // Current month in YYYY-MM format
        });
        setShowCreateForm(true);
    };

    const closeForm = () => {
        setShowCreateForm(false);
        setEditingCharge(null);
        setFormData({subscriptionServiceId: '', amount: '', chargeDate: ''});
    };

    const formatChargeDate = (chargeDate: string) => {
        const [year, month] = chargeDate.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    return (
        <div className="charges">
            <div className="charges-header">
                <h2>Charges Management</h2>
                <div className="charges-controls">
                    <select
                        value={selectedService}
                        onChange={(e) => setSelectedService(e.target.value)}
                        className="service-selector"
                    >
                        <option value="">Select a service to view charges</option>
                        {services.map((service) => (
                            <option key={service.id} value={service.id}>
                                {service.name}
                            </option>
                        ))}
                    </select>
                    {selectedService && (
                        <button onClick={openCreateForm} className="btn btn-primary">
                            Add New Charge
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            {(showCreateForm || editingCharge) && (
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>{editingCharge ? 'Edit Charge' : 'Create New Charge'}</h3>
                        <form onSubmit={editingCharge ? handleUpdate : handleCreate}>
                            <div className="form-group">
                                <label htmlFor="subscriptionServiceId">Service</label>
                                <select
                                    id="subscriptionServiceId"
                                    value={formData.subscriptionServiceId}
                                    onChange={(e) => setFormData({...formData, subscriptionServiceId: e.target.value})}
                                    required
                                    disabled={!!editingCharge}
                                >
                                    <option value="">Select a service</option>
                                    {services.map((service) => (
                                        <option key={service.id} value={service.id}>
                                            {service.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="amount">Amount</label>
                                <input
                                    type="number"
                                    id="amount"
                                    step="1"
                                    min="0"
                                    value={formData.amount}
                                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="chargeDate">Charge Date (Month)</label>
                                <input
                                    type="month"
                                    id="chargeDate"
                                    value={formData.chargeDate}
                                    onChange={(e) => setFormData({...formData, chargeDate: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-success">
                                    {editingCharge ? 'Update' : 'Create'}
                                </button>
                                <button type="button" onClick={closeForm} className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {!selectedService ? (
                <div className="empty-state">
                    <p>Please select a service to view and manage charges</p>
                </div>
            ) : loading ? (
                <div className="loading">Loading charges...</div>
            ) : (
                <div className="charges-list">
                    {charges.length === 0 ? (
                        <div className="empty-state">
                            <p>No charges found for this service. Create your first charge!</p>
                        </div>
                    ) : (
                        <div className="charges-grid">
                            {charges.map((charge) => (
                                <div key={charge.id} className="charge-card">
                                    <div className="charge-info">
                                        <h3>{charge.subscriptionServiceName}</h3>
                                        <p className="amount">${charge.amount.toFixed(2)}</p>
                                        <p className="date">Charge Period: {formatChargeDate(charge.chargeDate)}</p>
                                        <p className="date">Created: {new Date(charge.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="charge-actions">
                                        <button onClick={() => openEditForm(charge)} className="btn btn-sm btn-secondary">
                                            Edit
                                        </button>
                                        <button onClick={() => handleDelete(charge.id)} className="btn btn-sm btn-danger">
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
