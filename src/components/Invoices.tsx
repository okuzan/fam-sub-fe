import {useEffect, useState} from 'react';
import {API_CONFIG, getInvoicePdfUrl} from '../config/api';
import type {
    InvoiceDetailResponse,
    InvoiceGenerationRequest,
    InvoiceGenerationResult,
    InvoiceResponse,
    InvoiceSuggestion
} from '../types/invoice';
import type {SubscriberResponse} from '../types/subscriber';

export default function Invoices() {
    const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [suggestion, setSuggestion] = useState<InvoiceSuggestion | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetailResponse | null>(null);
    const [fromMonth, setFromMonth] = useState('');
    const [toMonth, setToMonth] = useState('');
    const [selectedSubscribers, setSelectedSubscribers] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showGenerateForm, setShowGenerateForm] = useState(false);

    useEffect(() => {
        fetchInvoices();
        fetchSubscribers();
        fetchSuggestedPeriod();
    }, []);

    const fetchInvoices = async () => {
        try {
            const response = await fetch(API_CONFIG.INVOICES_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setInvoices(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Failed to fetch invoices:', err);
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
            console.error('Failed to fetch subscribers:', err);
        }
    };

    const fetchSuggestedPeriod = async () => {
        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/suggested-period`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSuggestion(data);
                if (data.suggestedFromMonth && data.suggestedToMonth) {
                    setFromMonth(data.suggestedFromMonth);
                    setToMonth(data.suggestedToMonth);
                }
            }
        } catch (err) {
            console.error('Failed to fetch suggested period:', err);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const request: InvoiceGenerationRequest = {
                fromMonth,
                toMonth,
                subscriberIds: selectedSubscribers.length > 0 ? selectedSubscribers : undefined
            };

            const response = await fetch(`${API_CONFIG.INVOICES_URL}/generate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                const result: InvoiceGenerationResult = await response.json();
                setSuccess(`Generated ${result.invoicesCreated} invoices totaling $${result.totalAmount.toFixed(2)} with ${result.ledgerEntriesAssigned} ledger entries`);
                setShowGenerateForm(false);
                setSelectedSubscribers([]);
                fetchInvoices();
            } else {
                setError('Failed to generate invoices');
            }
        } catch (err) {
            console.error(err);
            setError('Error generating invoices');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsPaid = async (invoiceId: string) => {
        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${invoiceId}/mark-paid`, {
                method: 'PATCH',
                credentials: 'include'
            });

            if (response.ok) {
                setSuccess('Invoice marked as paid successfully');
                fetchInvoices();
                if (selectedInvoice?.invoice.id === invoiceId) {
                    // Update the selected invoice if it's currently open
                    setSelectedInvoice({
                        ...selectedInvoice,
                        invoice: {
                            ...selectedInvoice.invoice,
                            status: 'paid'
                        }
                    });
                }
            } else {
                setError('Failed to mark invoice as paid');
            }
        } catch (err) {
            console.error('Error marking invoice as paid:', err);
            setError('Error marking invoice as paid');
        }
    };

    const handleDownloadPdf = async (invoiceId: string) => {
        try {
            const response = await fetch(getInvoicePdfUrl(invoiceId), {
                credentials: 'include'
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `invoice-${invoiceId}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                setError('Failed to download PDF');
            }
        } catch (err) {
            console.error('Error downloading PDF:', err);
            setError('Error downloading PDF');
        }
    };
    const handleViewInvoice = async (invoiceId: string) => {
        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${invoiceId}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSelectedInvoice(data);
            } else {
                setError('Failed to fetch invoice details');
            }
        } catch (err) {
            console.error(err);
            setError('Error fetching invoice details');
        }
    };

    const useSuggestedPeriod = () => {
        if (suggestion?.suggestedFromMonth && suggestion?.suggestedToMonth) {
            setFromMonth(suggestion.suggestedFromMonth);
            setToMonth(suggestion.suggestedToMonth);
        }
    };

    const handleSubscriberChange = (subscriberId: string, checked: boolean) => {
        if (checked) {
            setSelectedSubscribers([...selectedSubscribers, subscriberId]);
        } else {
            setSelectedSubscribers(selectedSubscribers.filter(id => id !== subscriberId));
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {year: 'numeric', month: 'long'});
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'sent':
                return '#28a745';
            case 'draft':
                return '#ffc107';
            case 'paid':
                return '#007bff';
            default:
                return '#6c757d';
        }
    };

    return (
        <div className="invoices">
            <div className="invoices-header">
                <h3>Invoices</h3>
                <button onClick={() => setShowGenerateForm(true)} className="btn btn-primary">
                    Generate Invoices
                </button>
            </div>

            {suggestion && (
                <div className="suggestion-banner">
                    <p><strong>Suggested
                        Period:</strong> {suggestion.suggestedFromMonth && formatDate(suggestion.suggestedFromMonth)} - {suggestion.suggestedToMonth && formatDate(suggestion.suggestedToMonth)}
                    </p>
                    {suggestion.lastInvoicedToMonth && (
                        <p><em>Last invoiced to: {formatDate(suggestion.lastInvoicedToMonth)}</em></p>
                    )}
                    <button type="button" onClick={useSuggestedPeriod} className="btn btn-sm btn-secondary">
                        Use Suggested Period
                    </button>
                </div>
            )}

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <div className="invoices-list">
                {invoices.length === 0 ? (
                    <div className="empty-state">
                        <p>No invoices found. Generate your first invoice!</p>
                    </div>
                ) : (
                    <div className="invoices-grid">
                        {invoices.map((invoice) => (
                            <div key={invoice.id} className="invoice-card">
                                <div className="invoice-info">
                                    <h4>{invoice.subscriberName}</h4>
                                    <p>
                                        <strong>Period:</strong> {formatDate(invoice.fromMonth)} - {formatDate(invoice.toMonth)}
                                    </p>
                                    <p><strong>Amount:</strong> ${invoice.totalAmount.toFixed(2)}</p>
                                    <p><strong>Status:</strong> <span className="status-badge"
                                                                      style={{backgroundColor: getStatusColor(invoice.status)}}>{invoice.status}</span>
                                    </p>
                                    <p><strong>Created:</strong> {formatDate(invoice.createdAt)}</p>
                                    {invoice.emailSent &&
                                        <p><strong>Email:</strong> Sent {invoice.sentAt && formatDate(invoice.sentAt)}
                                        </p>}
                                </div>
                                <div className="invoice-actions">
                                    <button onClick={() => handleViewInvoice(invoice.id)}
                                            className="btn btn-sm btn-secondary">
                                        View Details
                                    </button>
                                    <button onClick={() => handleDownloadPdf(invoice.id)}
                                            className="btn btn-sm btn-primary">
                                        Download PDF
                                    </button>
                                    {invoice.status.toLowerCase() !== 'paid' && (
                                        <button onClick={() => handleMarkAsPaid(invoice.id)}
                                                className="btn btn-sm btn-success">
                                            Mark as Paid
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {(showGenerateForm) && (
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>Generate Invoices</h3>
                        <form onSubmit={handleGenerate}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="fromMonth">From Month</label>
                                    <input
                                        type="month"
                                        id="fromMonth"
                                        value={fromMonth}
                                        onChange={(e) => setFromMonth(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="toMonth">To Month</label>
                                    <input
                                        type="month"
                                        id="toMonth"
                                        value={toMonth}
                                        onChange={(e) => setToMonth(e.target.value)}
                                        min={fromMonth}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Subscribers (Optional - leave empty for all)</label>
                                <div className="subscribers-checkbox-list">
                                    {subscribers.map((subscriber) => (
                                        <label key={subscriber.id} className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={selectedSubscribers.includes(subscriber.id)}
                                                onChange={(e) => handleSubscriberChange(subscriber.id, e.target.checked)}
                                            />
                                            {subscriber.name} ({subscriber.email})
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="form-actions">
                                <button type="submit" disabled={loading} className="btn btn-success">
                                    {loading ? 'Generating...' : 'Generate Invoices'}
                                </button>
                                <button type="button" onClick={() => setShowGenerateForm(false)}
                                        className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {selectedInvoice && (
                <div className="form-overlay">
                    <div className="form-container invoice-detail">
                        <h3>Invoice Details</h3>
                        <div className="invoice-detail-info">
                            <h4>{selectedInvoice.invoice.subscriberName}</h4>
                            <p><strong>Invoice ID:</strong> {selectedInvoice.invoice.id}</p>
                            <p>
                                <strong>Period:</strong> {formatDate(selectedInvoice.invoice.fromMonth)} - {formatDate(selectedInvoice.invoice.toMonth)}
                            </p>
                            <p><strong>Total Amount:</strong> ${selectedInvoice.invoice.totalAmount.toFixed(2)}</p>
                            <p><strong>Status:</strong> <span className="status-badge"
                                                              style={{backgroundColor: getStatusColor(selectedInvoice.invoice.status)}}>{selectedInvoice.invoice.status}</span>
                            </p>
                            <p><strong>Created:</strong> {formatDate(selectedInvoice.invoice.createdAt)}</p>
                            {selectedInvoice.invoice.notes &&
                                <p><strong>Notes:</strong> {selectedInvoice.invoice.notes}</p>}
                        </div>

                        <h5>Ledger Entries ({selectedInvoice.entries.length})</h5>
                        <div className="ledger-entries">
                            {selectedInvoice.entries.map((entry) => (
                                <div key={entry.ledgerEntryId} className="ledger-entry">
                                    <p><strong>Service:</strong> {entry.subscriptionServiceName}</p>
                                    <p><strong>Month:</strong> {formatDate(entry.recordedMonth)}</p>
                                    <p><strong>Amount:</strong> ${entry.amount.toFixed(2)}</p>
                                    <p><strong>Participants:</strong> {entry.participantCount}</p>
                                </div>
                            ))}
                        </div>

                        <div className="form-actions">
                            {selectedInvoice.invoice.status.toLowerCase() !== 'paid' && (
                                <button onClick={() => handleMarkAsPaid(selectedInvoice.invoice.id)}
                                        className="btn btn-success">
                                    Mark as Paid
                                </button>
                            )}
                            <button onClick={() => handleDownloadPdf(selectedInvoice.invoice.id)}
                                    className="btn btn-primary">
                                Download PDF
                            </button>
                            <button onClick={() => setSelectedInvoice(null)} className="btn btn-secondary">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
