import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {API_CONFIG} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {useEscapeClose} from '../utils/useEscapeClose';
import {useToast} from './ToastContext';
import type {
    ChargeCreateRequest,
    ChargePageResponse,
    ChargeResponse,
    ChargeUpdateRequest
} from '../types/charge';
import type {SubscriptionServiceResponse} from '../types/subscription';

const PAGE_SIZE = 6;

export default function Charges() {
    const {showError, showSuccess} = useToast();
    const [charges, setCharges] = useState<ChargeResponse[]>([]);
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingCharge, setEditingCharge] = useState<ChargeResponse | null>(null);
    const [selectedService, setSelectedService] = useState<string>('');
    const [page, setPage] = useState(0);
    const [totalElements, setTotalElements] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [formData, setFormData] = useState({
        subscriptionServiceId: '',
        amount: '',
        chargeMonth: '',
        description: ''
    });

    useEffect(() => {
        fetchServices();
    }, []);

    useEffect(() => {
        if (selectedService) {
            fetchChargesByService(selectedService, page);
        } else {
            setCharges([]);
            setTotalElements(0);
            setTotalPages(0);
        }
    }, [selectedService, page]);

    const fetchServices = async () => {
        try {
            const response = await fetch(API_CONFIG.SUBSCRIPTION_SERVICES_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setServices(data);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch services'));
            }
        } catch (err) {
            console.error(err);
            showError('Error fetching services');
        }
    };

    const fetchChargesByService = async (serviceId: string, requestedPage = page) => {
        setLoading(true);
        try {
            const response = await fetch(
                `${API_CONFIG.CHARGES_URL}/service/${serviceId}?page=${requestedPage}&size=${PAGE_SIZE}`,
                {
                credentials: 'include'
                }
            );

            if (response.ok) {
                const data: ChargePageResponse = await response.json();
                setCharges(data.content);
                setTotalElements(data.totalElements);
                setTotalPages(data.totalPages);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch charges'));
            }
        } catch (err) {
            console.error(err);
            showError('Error fetching charges');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const request: ChargeCreateRequest = {
                subscriptionServiceId: formData.subscriptionServiceId,
                amount: parseFloat(formData.amount),
                chargeMonth: formData.chargeMonth,
                description: formData.description || undefined
            };

            const response = await fetch(API_CONFIG.CHARGES_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                setPage(0);
                await fetchChargesByService(formData.subscriptionServiceId, 0);
                setShowCreateForm(false);
                setFormData({subscriptionServiceId: '', amount: '', chargeMonth: '', description: ''});
                showSuccess('Charge created successfully');
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to create charge'));
            }
        } catch (err) {
            console.error(err);
            showError('Error creating charge');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingCharge) return;

        try {
            const request: ChargeUpdateRequest = {
                amount: parseFloat(formData.amount),
                description: formData.description || undefined
            };

            const response = await fetch(`${API_CONFIG.CHARGES_URL}/${editingCharge.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchChargesByService(editingCharge.subscriptionServiceId, page);
                setEditingCharge(null);
                setFormData({subscriptionServiceId: '', amount: '', chargeMonth: '', description: ''});
                showSuccess('Charge updated successfully');
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to update charge'));
            }
        } catch (err) {
            console.error(err);
            showError('Error updating charge');
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
                const nextPage = charges.length === 1 && page > 0 ? page - 1 : page;
                setPage(nextPage);
                await fetchChargesByService(selectedService, nextPage);
                showSuccess('Charge deleted successfully');
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to delete charge'));
            }
        } catch (err) {
            console.error(err);
            showError('Error deleting charge');
        }
    };

    const openEditForm = (charge: ChargeResponse) => {
        setEditingCharge(charge);
        setFormData({
            subscriptionServiceId: charge.subscriptionServiceId,
            amount: charge.amount.toString(),
            chargeMonth: charge.chargeMonth,
            description: charge.description || ''
        });
        setShowCreateForm(false);
    };

    const openCreateForm = () => {
        setEditingCharge(null);
        setFormData({
            subscriptionServiceId: selectedService,
            amount: '',
            chargeMonth: new Date().toISOString().slice(0, 7), // Current month in YYYY-MM format
            description: ''
        });
        setShowCreateForm(true);
    };

    const closeForm = () => {
        setShowCreateForm(false);
        setEditingCharge(null);
        setFormData({subscriptionServiceId: '', amount: '', chargeMonth: '', description: ''});
    };

    useEscapeClose(showCreateForm || Boolean(editingCharge), closeForm);

    const formatChargeMonth = (chargeMonth: string) => {
        const [year, month] = chargeMonth.split('-');
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
                        onChange={(e) => {
                            setSelectedService(e.target.value);
                            setPage(0);
                        }}
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

            {(showCreateForm || editingCharge) && createPortal(
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
                                <label htmlFor="amount">Amount (UAH)</label>
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
                                <label htmlFor="chargeMonth">Charge Month</label>
                                <input
                                    type="month"
                                    id="chargeMonth"
                                    value={formData.chargeMonth}
                                    onChange={(e) => setFormData({...formData, chargeMonth: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="description">Description</label>
                                <input
                                    type="text"
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    placeholder="Optional description"
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
                </div>,
                document.body
            )}

            {!selectedService ? (
                <div className="empty-state">
                    <p>Please select a service to view and manage charges</p>
                </div>
            ) : loading ? (
                <div className="loading">Loading charges...</div>
            ) : (
                <div className="charges-list">
                    {charges.length > 0 && (
                        <div className="charges-summary">
                            {totalElements} {totalElements === 1 ? 'charge' : 'charges'} · newest first
                        </div>
                    )}
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
                                        <p className="amount">₴{charge.amount.toFixed(2)}</p>
                                        <p className="date">Charge Period: {formatChargeMonth(charge.chargeMonth)}</p>
                                        {charge.description && (
                                            <p className="description">Description: {charge.description}</p>
                                        )}
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
                    {totalPages > 1 && (
                        <nav className="charges-pagination" aria-label="Charges pages">
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setPage((current) => current - 1)}
                                disabled={page === 0}
                            >
                                Previous
                            </button>
                            <span>Page {page + 1} of {totalPages}</span>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setPage((current) => current + 1)}
                                disabled={page + 1 >= totalPages}
                            >
                                Next
                            </button>
                        </nav>
                    )}
                </div>
            )}
        </div>
    );
}
