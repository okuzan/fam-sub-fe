import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {API_CONFIG} from '../config/api';
import type {
    SubscriptionServiceCreateRequest,
    SubscriptionServiceResponse,
    SubscriptionServiceUpdateRequest
} from '../types/subscription';

export default function SubscriptionServices() {
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingService, setEditingService] = useState<SubscriptionServiceResponse | null>(null);
    const [formData, setFormData] = useState({name: '', price: ''});

    useEffect(() => {
        fetchServices();
    }, []);

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
            console.error(err)
            setError('Error fetching services');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            const request: SubscriptionServiceCreateRequest = {
                name: formData.name,
                price: parseFloat(formData.price)
            };

            const response = await fetch(API_CONFIG.SUBSCRIPTION_SERVICES_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchServices();
                setShowCreateForm(false);
                setFormData({name: '', price: ''});
            } else {
                setError('Failed to create service');
            }
        } catch (err) {
            console.error(err)
            setError('Error creating service');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingService) return;

        try {
            const request: SubscriptionServiceUpdateRequest = {
                name: formData.name,
                price: parseFloat(formData.price)
            };

            const response = await fetch(`${API_CONFIG.SUBSCRIPTION_SERVICES_URL}/${editingService.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchServices();
                setEditingService(null);
                setFormData({name: '', price: ''});
            } else {
                setError('Failed to update service');
            }
        } catch (err) {
            console.error(err)
            setError('Error updating service');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this service?')) return;

        try {
            const response = await fetch(`${API_CONFIG.SUBSCRIPTION_SERVICES_URL}/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                await fetchServices();
            } else {
                setError('Failed to delete service');
            }
        } catch (err) {
            console.error(err)
            setError('Error deleting service');
        }
    };

    const openEditForm = (service: SubscriptionServiceResponse) => {
        setEditingService(service);
        setFormData({name: service.name, price: service.price.toString()});
        setShowCreateForm(false);
    };

    const openCreateForm = () => {
        setEditingService(null);
        setFormData({name: '', price: ''});
        setShowCreateForm(true);
    };

    const closeForm = () => {
        setShowCreateForm(false);
        setEditingService(null);
        setFormData({name: '', price: ''});
    };

    if (loading) return <div className="loading">Loading services...</div>;

    return (
        <div className="subscription-services">
            <div className="services-header">
                <h2>Subscription Services</h2>
                <button onClick={openCreateForm} className="btn btn-primary">
                    Add New Service
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {(showCreateForm || editingService) && createPortal(
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>{editingService ? 'Edit Service' : 'Create New Service'}</h3>
                        <form onSubmit={editingService ? handleUpdate : handleCreate}>
                            <div className="form-group">
                                <label htmlFor="name">Service Name</label>
                                <input
                                    type="text"
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="price">Price</label>
                                <input
                                    type="number"
                                    id="price"
                                    step="1"
                                    min="0"
                                    value={formData.price}
                                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-success">
                                    {editingService ? 'Update' : 'Create'}
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

            <div className="services-list">
                {services.length === 0 ? (
                    <div className="empty-state">
                        <p>No services found. Create your first service!</p>
                    </div>
                ) : (
                    <div className="services-grid">
                        {services.map((service) => (
                            <div key={service.id} className="service-card">
                                <div className="service-info">
                                    <h3>{service.name}</h3>
                                    <p className="price">₴{service.price.toFixed(2)}</p>
                                    <p className="date">Created: {new Date(service.createdAt).toLocaleDateString()}</p>
                                </div>
                                <div className="service-actions">
                                    <button onClick={() => openEditForm(service)} className="btn btn-sm btn-secondary">
                                        Edit
                                    </button>
                                    <button onClick={() => handleDelete(service.id)} className="btn btn-sm btn-danger">
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
