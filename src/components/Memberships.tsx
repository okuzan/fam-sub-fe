import {useEffect, useState} from 'react';
import {API_CONFIG} from '../config/api';
import {useToast} from './Toast';
import type {
    MembershipCreateRequest,
    MembershipEndRequest,
    MembershipResponse,
    MembershipUpdateRequest
} from '../types/membership';
import type {SubscriberResponse} from '../types/subscriber';
import type {SubscriptionServiceResponse} from '../types/subscription';

export default function Memberships() {
    const {showError, showSuccess} = useToast();
    const [memberships, setMemberships] = useState<MembershipResponse[]>([]);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [services, setServices] = useState<SubscriptionServiceResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingMembership, setEditingMembership] = useState<MembershipResponse | null>(null);
    const [filterMode, setFilterMode] = useState<'service' | 'subscriber' | 'all'>('all');
    const [selectedService, setSelectedService] = useState('');
    const [selectedSubscriber, setSelectedSubscriber] = useState('');
    const [selectedYearMonth, setSelectedYearMonth] = useState(
        new Date().toISOString().slice(0, 7) // YYYY-MM format
    );
    const [formData, setFormData] = useState({
        subscriberId: '',
        serviceId: '',
        startDate: '',
        endMonth: ''
    });

    useEffect(() => {
        fetchSubscribers();
        fetchServices();
    }, []);

    useEffect(() => {
        fetchMemberships();
    }, [filterMode, selectedService, selectedSubscriber, selectedYearMonth]);

    const fetchMemberships = async () => {
        try {
            let url: string = API_CONFIG.MEMBERSHIPS_URL;

            if (filterMode === 'service' && selectedService) {
                const [year, month] = selectedYearMonth.split('-');
                url = `${API_CONFIG.MEMBERSHIPS_URL}/service/${selectedService}/active/${year}-${month}`;
            } else if (filterMode === 'subscriber' && selectedSubscriber) {
                const [year, month] = selectedYearMonth.split('-');
                url = `${API_CONFIG.MEMBERSHIPS_URL}/subscriber/${selectedSubscriber}/active/${year}-${month}`;
            } else {
                // Default: get all memberships by service (no month filter)
                if (selectedService) {
                    url = `${API_CONFIG.MEMBERSHIPS_URL}/service/${selectedService}`;
                } else {
                    // If no specific filter, we can't fetch without a proper endpoint
                    setMemberships([]);
                    setLoading(false);
                    return;
                }
            }

            const response = await fetch(url, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setMemberships(Array.isArray(data) ? data : []);
            } else {
                showError('Failed to fetch memberships');
                setMemberships([]);
            }
        } catch (err) {
            console.error(err);
            showError('Error fetching memberships');
            setMemberships([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchSubscribers = async () => {
        try {
            const response = await fetch(API_CONFIG.SUBSCRIBERS_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSubscribers(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchServices = async () => {
        try {
            const response = await fetch(API_CONFIG.SUBSCRIPTION_SERVICES_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setServices(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const request: MembershipCreateRequest = {
                subscriberId: formData.subscriberId,
                subscriptionServiceId: formData.serviceId,
                startMonth: formData.startDate,
                endMonth: formData.endMonth || undefined
            };

            const response = await fetch(API_CONFIG.MEMBERSHIPS_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchMemberships();
                setShowCreateForm(false);
                setFormData({subscriberId: '', serviceId: '', startDate: '', endMonth: ''});
                showSuccess('Membership created successfully');
            } else {
                showError('Failed to create membership');
            }
        } catch (err) {
            console.error(err);
            showError('Error creating membership');
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMembership) return;

        try {
            const request: MembershipUpdateRequest = {
                subscriberId: formData.subscriberId || undefined,
                subscriptionServiceId: formData.serviceId || undefined,
                startMonth: formData.startDate || undefined,
                endMonth: formData.endMonth || undefined
            };

            const response = await fetch(`${API_CONFIG.MEMBERSHIPS_URL}/${editingMembership.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchMemberships();
                setEditingMembership(null);
                setFormData({subscriberId: '', serviceId: '', startDate: '', endMonth: ''});
                showSuccess('Membership updated successfully');
            } else {
                showError('Failed to update membership');
            }
        } catch (err) {
            console.error(err);
            showError('Error updating membership');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this membership?')) return;

        try {
            const response = await fetch(`${API_CONFIG.MEMBERSHIPS_URL}/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                await fetchMemberships();
                showSuccess('Membership deleted successfully');
            } else {
                showError('Failed to delete membership');
            }
        } catch (err) {
            console.error(err);
            showError('Error deleting membership');
        }
    };

    const handleEndMembership = async (id: string) => {
        const endDate = prompt('Enter end date (YYYY-MM):');
        if (!endDate) return;

        try {
            const request: MembershipEndRequest = {endMonth: endDate};

            const response = await fetch(`${API_CONFIG.MEMBERSHIPS_URL}/${id}/end`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                await fetchMemberships();
                showSuccess('Membership ended successfully');
            } else {
                showError('Failed to end membership');
            }
        } catch (err) {
            console.error(err);
            showError('Error ending membership');
        }
    };

    const openEditForm = (membership: MembershipResponse) => {
        setEditingMembership(membership);
        setFormData({
            subscriberId: membership.subscriberId,
            serviceId: membership.subscriptionServiceId,
            startDate: membership.startMonth,
            endMonth: membership.endMonth || ''
        });
        setShowCreateForm(false);
    };

    const openCreateForm = () => {
        setEditingMembership(null);
        setFormData({subscriberId: '', serviceId: '', startDate: '', endMonth: ''});
        setShowCreateForm(true);
    };

    const closeForm = () => {
        setShowCreateForm(false);
        setEditingMembership(null);
        setFormData({subscriberId: '', serviceId: '', startDate: '', endMonth: ''});
    };

    const getSubscriberName = (subscriberId: string) => {
        const subscriber = subscribers.find(s => s.id === subscriberId);
        return subscriber?.name || 'Unknown';
    };

    const getServiceName = (subscriptionServiceId: string) => {
        const service = services.find(s => s.id === subscriptionServiceId);
        return service?.name || 'Unknown';
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {year: 'numeric', month: 'long'});
    };

    if (loading) return <div className="loading">Loading memberships...</div>;

    return (
        <div className="memberships">
            <div className="memberships-header">
                <h2>Memberships</h2>
                <button onClick={openCreateForm} className="btn btn-primary">
                    Add New Membership
                </button>
            </div>

            <div className="memberships-filters">
                <div className="filter-row">
                    <div className="filter-group">
                        <label>View Mode:</label>
                        <select value={filterMode}
                                onChange={(e) => setFilterMode(e.target.value as 'service' | 'subscriber' | 'all')}>
                            <option value="all">All by Service</option>
                            <option value="service">Active by Service & Month</option>
                            <option value="subscriber">Active by Subscriber & Month</option>
                        </select>
                    </div>

                    {filterMode !== 'all' && (
                        <>
                            <div className="filter-group">
                                <label>{filterMode === 'service' ? 'Service:' : 'Subscriber:'}</label>
                                <select
                                    value={filterMode === 'service' ? selectedService : selectedSubscriber}
                                    onChange={(e) => filterMode === 'service'
                                        ? setSelectedService(e.target.value)
                                        : setSelectedSubscriber(e.target.value)}
                                >
                                    <option
                                        value="">Select {filterMode === 'service' ? 'service' : 'subscriber'}</option>
                                    {filterMode === 'service'
                                        ? services.map((service) => (
                                            <option key={service.id} value={service.id}>
                                                {service.name}
                                            </option>
                                        ))
                                        : subscribers.map((subscriber) => (
                                            <option key={subscriber.id} value={subscriber.id}>
                                                {subscriber.name}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="filter-group">
                                <label>Year-Month:</label>
                                <input
                                    type="month"
                                    value={selectedYearMonth}
                                    onChange={(e) => setSelectedYearMonth(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {filterMode === 'all' && (
                        <div className="filter-group">
                            <label>Service (optional):</label>
                            <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
                                <option value="">All services</option>
                                {services.map((service) => (
                                    <option key={service.id} value={service.id}>
                                        {service.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {(showCreateForm || editingMembership) && (
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>{editingMembership ? 'Edit Membership' : 'Create New Membership'}</h3>
                        <form onSubmit={editingMembership ? handleUpdate : handleCreate}>
                            <div className="form-group">
                                <label htmlFor="subscriberId">Subscriber</label>
                                <select
                                    id="subscriberId"
                                    value={formData.subscriberId}
                                    onChange={(e) => setFormData({...formData, subscriberId: e.target.value})}
                                    required
                                >
                                    <option value="">Select a subscriber</option>
                                    {subscribers.map((subscriber) => (
                                        <option key={subscriber.id} value={subscriber.id}>
                                            {subscriber.name} ({subscriber.email})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="serviceId">Service</label>
                                <select
                                    id="serviceId"
                                    value={formData.serviceId}
                                    onChange={(e) => setFormData({...formData, serviceId: e.target.value})}
                                    required
                                >
                                    <option value="">Select a service</option>
                                    {services.map((service) => (
                                        <option key={service.id} value={service.id}>
                                            {service.name} - ₴{service.price}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="startDate">Start Date</label>
                                <input
                                    type="month"
                                    id="startDate"
                                    value={formData.startDate}
                                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="endMonth">End Date (optional)</label>
                                <input
                                    type="month"
                                    id="endMonth"
                                    value={formData.endMonth}
                                    onChange={(e) => setFormData({...formData, endMonth: e.target.value})}
                                    min={formData.startDate}
                                />
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-success">
                                    {editingMembership ? 'Update' : 'Create'}
                                </button>
                                <button type="button" onClick={closeForm} className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="memberships-list">
                {memberships.length === 0 ? (
                    <div className="empty-state">
                        <p>No memberships found. Create your first membership!</p>
                    </div>
                ) : (
                    <div className="memberships-grid">
                        {memberships.map((membership) => (
                            <div key={membership.id} className="membership-card">
                                <div className="membership-info">
                                    <h3>{getSubscriberName(membership.subscriberId)}</h3>
                                    <p className="service">Service: {getServiceName(membership.subscriptionServiceId)}</p>
                                    <p className="date">Start: {formatDate(membership.startMonth)}</p>
                                    {membership.endMonth && (
                                        <p className="date">End: {formatDate(membership.endMonth)}</p>
                                    )}
                                    <p className="date">Created: {new Date(membership.createdAt).toLocaleDateString()}</p>
                                    {!membership.endMonth && (
                                        <span className="status-active">Active</span>
                                    )}
                                </div>
                                <div className="membership-actions">
                                    <button onClick={() => openEditForm(membership)}
                                            className="btn btn-sm btn-secondary">
                                        Edit
                                    </button>
                                    {!membership.endMonth && (
                                        <button onClick={() => handleEndMembership(membership.id)}
                                                className="btn btn-sm btn-warning">
                                            End
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(membership.id)}
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
