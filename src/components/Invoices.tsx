import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {API_CONFIG, getInvoicePdfUrl} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {useToast} from './Toast';
import type {
    DraftInvoiceBulkEmailResult,
    InvoiceBulkBalancePaymentItemResult,
    InvoiceBulkBalancePaymentResult,
    InvoiceDetailResponse,
    InvoiceOrigin,
    InvoiceGenerationRequest,
    InvoiceGenerationResult,
    InvoiceStatus,
    InvoiceStatusUpdateRequest,
    InvoiceVoidRequest,
    ManualInvoiceCreateRequest,
    InvoiceNotesUpdateRequest,
    InvoiceResponse,
    InvoiceSuggestion,
    InvoiceFilterRequest,
    InvoiceStatusHistoryResponse
} from '../types/invoice';
import type {SubscriberResponse} from '../types/subscriber';

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const addOneMonth = (month: string) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, monthIndex - 1, 1));
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 7);
};

const resolveSuggestedInvoicePeriod = (suggestion: InvoiceSuggestion | null) => {
    if (!suggestion) {
        return null;
    }

    if (suggestion.suggestedFromMonth && suggestion.suggestedToMonth) {
        return {
            fromMonth: suggestion.suggestedFromMonth,
            toMonth: suggestion.suggestedToMonth
        };
    }

    if (suggestion.lastInvoicedToMonth) {
        const nextMonth = addOneMonth(suggestion.lastInvoicedToMonth);
        return {
            fromMonth: nextMonth,
            toMonth: nextMonth
        };
    }

    return null;
};

const createManualInvoiceInitialState = () => ({
    subscriberId: '',
    amount: '',
    invoiceMonth: getCurrentMonth(),
    notes: '',
    sendEmail: false
});

const INVOICE_STATUS_OPTIONS: InvoiceStatus[] = ['DRAFT', 'SENT', 'PAID', 'VOID'];

export default function Invoices() {
    const {showError, showSuccess} = useToast();
    const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
    const [subscribers, setSubscribers] = useState<SubscriberResponse[]>([]);
    const [suggestion, setSuggestion] = useState<InvoiceSuggestion | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetailResponse | null>(null);
    const [subscriberBalance, setSubscriberBalance] = useState<number | null>(null);
    const [fromMonth, setFromMonth] = useState('');
    const [toMonth, setToMonth] = useState('');
    const [selectedSubscribers, setSelectedSubscribers] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [emailingInvoices, setEmailingInvoices] = useState<Set<string>>(new Set());
    const [emailingDetailInvoice, setEmailingDetailInvoice] = useState(false);
    const [emailingDraftInvoices, setEmailingDraftInvoices] = useState(false);
    const [payingDraftInvoicesFromBalance, setPayingDraftInvoicesFromBalance] = useState(false);
    const [loadingDraftInvoicePreview, setLoadingDraftInvoicePreview] = useState(false);
    const [updatingInvoiceStatuses, setUpdatingInvoiceStatuses] = useState<Set<string>>(new Set());
    const [loadingStatusHistory, setLoadingStatusHistory] = useState(false);
    const [statusHistoryInvoice, setStatusHistoryInvoice] = useState<InvoiceResponse | null>(null);
    const [statusHistory, setStatusHistory] = useState<InvoiceStatusHistoryResponse[]>([]);
    const [showGenerateForm, setShowGenerateForm] = useState(false);
    const [showManualInvoiceForm, setShowManualInvoiceForm] = useState(false);
    const [showFilterForm, setShowFilterForm] = useState(false);
    const [showDraftEmailPreview, setShowDraftEmailPreview] = useState(false);
    const [showDraftBalancePaymentModal, setShowDraftBalancePaymentModal] = useState(false);
    const [draftEmailPreviewInvoices, setDraftEmailPreviewInvoices] = useState<InvoiceResponse[]>([]);
    const [draftBalancePaymentResult, setDraftBalancePaymentResult] = useState<InvoiceBulkBalancePaymentResult | null>(null);
    const [filters, setFilters] = useState<InvoiceFilterRequest>({});
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesInput, setNotesInput] = useState('');
    const [manualInvoiceData, setManualInvoiceData] = useState(createManualInvoiceInitialState);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showVoidModal, setShowVoidModal] = useState(false);
    const [voidReason, setVoidReason] = useState('');
    const [voidInvoiceData, setVoidInvoiceData] = useState<{
        invoiceId: string;
        subscriberName: string;
    } | null>(null);
    const [deleteInvoiceData, setDeleteInvoiceData] = useState<{
        invoiceId: string;
        subscriberName: string;
        origin: InvoiceOrigin;
        addToBalance: boolean;
    } | null>(null);

    useEffect(() => {
        fetchInvoices();
        fetchSubscribers();
        fetchSuggestedPeriod();
    }, []);

    useEffect(() => {
        const handleInvoiceRefresh = () => {
            fetchInvoices();
        };

        const customEventListener = () => {
            handleInvoiceRefresh();
        };

        window.addEventListener('invoice-refresh-needed', customEventListener);
        return () => window.removeEventListener('invoice-refresh-needed', customEventListener);
    }, []);

    const fetchInvoices = async (applyFilters: boolean = false) => {
        try {
            let url: string = API_CONFIG.INVOICES_URL;
            const options: RequestInit = {
                credentials: 'include'
            };

            if (applyFilters && Object.keys(filters).length > 0) {
                url = `${API_CONFIG.INVOICES_URL}/filter`;
                options.method = 'POST';
                options.headers = {'Content-Type': 'application/json'};
                options.body = JSON.stringify(filters);
            }

            const response = await fetch(url, options);

            if (response.ok) {
                const data = await response.json();
                setInvoices(Array.isArray(data) ? data : []);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch invoices'));
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
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch subscribers'));
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
                const resolvedPeriod = resolveSuggestedInvoicePeriod(data);
                if (resolvedPeriod) {
                    setFromMonth(resolvedPeriod.fromMonth);
                    setToMonth(resolvedPeriod.toMonth);
                }
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch suggested invoice period'));
            }
        } catch (err) {
            console.error('Failed to fetch suggested period:', err);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

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
                showSuccess(`Generated ${result.invoicesCreated} invoices totaling ₴${result.totalAmount.toFixed(2)} with ${result.ledgerEntriesAssigned} ledger entries`);
                setShowGenerateForm(false);
                setSelectedSubscribers([]);
                fetchInvoices(hasActiveFilters);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to generate invoices'));
            }
        } catch (err) {
            console.error(err);
            showError('Error generating invoices');
        } finally {
            setLoading(false);
        }
    };

    const applyUpdatedInvoice = (updatedInvoice: InvoiceResponse) => {
        setInvoices(prev => prev.map(invoice =>
            invoice.id === updatedInvoice.id ? updatedInvoice : invoice
        ));

        setSelectedInvoice(prev => {
            if (!prev || prev.invoice.id !== updatedInvoice.id) {
                return prev;
            }

            return {
                ...prev,
                invoice: updatedInvoice
            };
        });
    };

    const handleUpdateInvoiceStatus = async (invoiceId: string, status: InvoiceStatus) => {
        const request: InvoiceStatusUpdateRequest = {status};

        setUpdatingInvoiceStatuses(prev => new Set(prev).add(invoiceId));

        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${invoiceId}/status`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                const updatedInvoice: InvoiceResponse = await response.json();
                applyUpdatedInvoice(updatedInvoice);
                showSuccess(`Invoice status updated to ${updatedInvoice.status}`);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to update invoice status'));
            }
        } catch (err) {
            console.error('Error updating invoice status:', err);
            showError('Error updating invoice status');
        } finally {
            setUpdatingInvoiceStatuses(prev => {
                const next = new Set(prev);
                next.delete(invoiceId);
                return next;
            });
        }
    };

    const openDeleteModal = (invoice: InvoiceResponse) => {
        setDeleteInvoiceData({
            invoiceId: invoice.id,
            subscriberName: invoice.subscriberName,
            origin: invoice.origin,
            addToBalance: invoice.origin === 'OUTSTANDING_BALANCE'
        });
        setShowDeleteModal(true);
    };

    const openVoidModal = (invoice: InvoiceResponse) => {
        setVoidInvoiceData({
            invoiceId: invoice.id,
            subscriberName: invoice.subscriberName
        });
        setVoidReason('');
        setShowVoidModal(true);
    };

    const closeManualInvoiceForm = () => {
        setShowManualInvoiceForm(false);
        setManualInvoiceData(createManualInvoiceInitialState());
    };

    const handleCreateManualInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const request: ManualInvoiceCreateRequest = {
                subscriberId: manualInvoiceData.subscriberId,
                amount: parseFloat(manualInvoiceData.amount),
                invoiceMonth: manualInvoiceData.invoiceMonth,
                notes: manualInvoiceData.notes.trim(),
                sendEmail: manualInvoiceData.sendEmail
            };

            const response = await fetch(`${API_CONFIG.INVOICES_URL}/manual`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                const invoice: InvoiceResponse = await response.json();
                showSuccess(`Created manual invoice for ${invoice.subscriberName} totaling ₴${invoice.totalAmount.toFixed(2)}`);
                closeManualInvoiceForm();
                fetchInvoices(hasActiveFilters);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to create manual invoice'));
            }
        } catch (err) {
            console.error('Error creating manual invoice:', err);
            showError('Error creating manual invoice');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteInvoice = async () => {
        if (!deleteInvoiceData) return;

        setLoading(true);

        try {
            const addToBalance = deleteInvoiceData.addToBalance;
            const response = await fetch(
                `${API_CONFIG.INVOICES_URL}/${deleteInvoiceData.invoiceId}?addToBalance=${addToBalance}`,
                {
                    method: 'DELETE',
                    credentials: 'include'
                }
            );

            if (response.ok) {
                const result = await response.json();
                showSuccess(result.message || 'Invoice deleted successfully');
                setShowDeleteModal(false);
                setDeleteInvoiceData(null);
                fetchInvoices(hasActiveFilters);
                if (selectedInvoice?.invoice.id === deleteInvoiceData.invoiceId) {
                    setSelectedInvoice(null);
                }
            } else {
                const fallback = response.status === 400
                    ? 'Only draft manual or outstanding balance invoices can be deleted'
                    : response.status === 404
                        ? 'Invoice not found'
                        : 'Failed to delete invoice';
                showError(await getResponseErrorMessage(response, fallback));
            }
        } catch (err) {
            console.error('Error deleting invoice:', err);
            showError('Error deleting invoice');
        } finally {
            setLoading(false);
        }
    };

    const handleVoidInvoice = async () => {
        if (!voidInvoiceData) return;

        setLoading(true);

        try {
            const request: InvoiceVoidRequest = {
                reason: voidReason.trim() || undefined
            };

            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${voidInvoiceData.invoiceId}/void`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                showSuccess('Invoice voided successfully');
                setShowVoidModal(false);
                setVoidInvoiceData(null);
                setVoidReason('');
                fetchInvoices(hasActiveFilters);
                if (selectedInvoice?.invoice.id === voidInvoiceData.invoiceId) {
                    await handleViewInvoice(voidInvoiceData.invoiceId);
                }
                window.dispatchEvent(new CustomEvent('subscriber-refresh-needed'));
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to void invoice'));
            }
        } catch (err) {
            console.error('Error voiding invoice:', err);
            showError('Error voiding invoice');
        } finally {
            setLoading(false);
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
                showError(await getResponseErrorMessage(response, 'Failed to download PDF'));
            }
        } catch (err) {
            console.error('Error downloading PDF:', err);
            showError('Error downloading PDF');
        }
    };

    const handleEmailInvoice = async (invoiceId: string, subscriberName: string) => {
        
        // Add this invoice to the loading set
        setEmailingInvoices(prev => new Set(prev).add(invoiceId));

        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${invoiceId}/email`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                showSuccess(`Invoice email sent to ${subscriberName}: ${result.message || 'Invoice email sent successfully'}`);
                // Refresh invoice data to show updated email status
                if (selectedInvoice?.invoice.id === invoiceId) {
                    await handleViewInvoice(invoiceId);
                }
                // Refresh invoices list to show updated email status
                fetchInvoices(hasActiveFilters);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to send invoice email'));
            }
        } catch (err) {
            console.error('Error sending invoice email:', err);
            showError('Error sending invoice email');
        } finally {
            // Remove this invoice from the loading set
            setEmailingInvoices(prev => {
                const newSet = new Set(prev);
                newSet.delete(invoiceId);
                return newSet;
            });
        }
    };

    const handlePreviewDraftInvoices = async () => {
        setLoadingDraftInvoicePreview(true);

        try {
            const request: InvoiceFilterRequest = {status: 'DRAFT'};
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/filter`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                const data = await response.json();
                setDraftEmailPreviewInvoices(Array.isArray(data) ? data : []);
                setShowDraftEmailPreview(true);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch draft invoices'));
            }
        } catch (err) {
            console.error('Error fetching draft invoice preview:', err);
            showError('Error fetching draft invoices');
        } finally {
            setLoadingDraftInvoicePreview(false);
        }
    };

    const handleEmailDraftInvoices = async () => {
        if (draftEmailPreviewInvoices.length === 0) {
            return;
        }

        setEmailingDraftInvoices(true);

        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/drafts/email`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const result: DraftInvoiceBulkEmailResult = await response.json();
                const failedInvoiceIds = result.failedInvoiceIds ?? result.items
                    .filter((item) => item.success === false || Boolean(item.error))
                    .map((item) => item.invoiceId)
                    .filter(Boolean);

                if (result.failedCount > 0) {
                    showError(
                        `Sent ${result.sentCount}/${result.attemptedCount} draft invoice emails. Failed: ${failedInvoiceIds.join(', ') || result.failedCount}`
                    );
                } else {
                    showSuccess(`Sent ${result.sentCount} draft invoice emails${result.dryRun ? ' (dry run)' : ''}`);
                }

                fetchInvoices(hasActiveFilters);
                setShowDraftEmailPreview(false);
                setDraftEmailPreviewInvoices([]);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to email draft invoices'));
            }
        } catch (err) {
            console.error('Error emailing draft invoices:', err);
            showError('Error emailing draft invoices');
        } finally {
            setEmailingDraftInvoices(false);
        }
    };

    const getDraftBalancePaymentSummary = (result: InvoiceBulkBalancePaymentResult) => {
        const total = `Total paid: ₴${result.totalPaidAmount.toFixed(2)}.`;

        if (result.failedCount > 0) {
            return `Paid ${result.paidCount} of ${result.attemptedCount} draft invoices. Skipped ${result.skippedCount}, failed ${result.failedCount}. ${total}`;
        }

        return `Paid ${result.paidCount} of ${result.attemptedCount} draft invoices from credit balance. Skipped ${result.skippedCount} due to insufficient credit balance. ${total}`;
    };

    const getDraftBalancePaymentItemResult = (item: InvoiceBulkBalancePaymentItemResult) => {
        if (item.paid) {
            return 'Paid';
        }

        if (item.skipped) {
            return 'Skipped';
        }

        return 'Failed';
    };

    const openDraftBalancePaymentModal = () => {
        setDraftBalancePaymentResult(null);
        setShowDraftBalancePaymentModal(true);
    };

    const closeDraftBalancePaymentModal = () => {
        if (payingDraftInvoicesFromBalance) {
            return;
        }

        setShowDraftBalancePaymentModal(false);
        setDraftBalancePaymentResult(null);
    };

    const handlePayDraftInvoicesFromBalance = async () => {
        setPayingDraftInvoicesFromBalance(true);

        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/drafts/pay-from-balance`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const result: InvoiceBulkBalancePaymentResult = await response.json();
                setDraftBalancePaymentResult(result);
                showSuccess(getDraftBalancePaymentSummary(result));

                await fetchInvoices(hasActiveFilters);
                await fetchSubscribers();

                if (selectedInvoice) {
                    await handleViewInvoice(selectedInvoice.invoice.id);
                }

                window.dispatchEvent(new CustomEvent('subscriber-refresh-needed'));
            } else {
                showError(await getResponseErrorMessage(response, 'Could not pay draft invoices from credit balance.'));
            }
        } catch (err) {
            console.error('Error paying draft invoices from credit balance:', err);
            showError('Could not pay draft invoices from credit balance.');
        } finally {
            setPayingDraftInvoicesFromBalance(false);
        }
    };

    const handleEmailInvoiceFromDetail = async (invoiceId: string, subscriberName: string) => {
        setEmailingDetailInvoice(true);

        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${invoiceId}/email`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                showSuccess(`Invoice email sent to ${subscriberName}: ${result.message || 'Invoice email sent successfully'}`);
                // Refresh invoice data to show updated email status
                await handleViewInvoice(invoiceId);
                // Refresh invoices list to show updated email status
                fetchInvoices(hasActiveFilters);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to send invoice email'));
            }
        } catch (err) {
            console.error('Error sending invoice email:', err);
            showError('Error sending invoice email');
        } finally {
            setEmailingDetailInvoice(false);
        }
    };
    const fetchSubscriberBalance = async (subscriberId: string) => {
        try {
            const response = await fetch(`${API_CONFIG.SUBSCRIBERS_URL}/${subscriberId}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const subscriber = await response.json();
                setSubscriberBalance(subscriber.balance);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch subscriber credit balance'));
            }
        } catch (err) {
            console.error('Failed to fetch subscriber credit balance:', err);
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
                // Fetch subscriber credit balance for this invoice
                await fetchSubscriberBalance(data.invoice.subscriberId);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch invoice details'));
            }
        } catch (err) {
            console.error(err);
            showError('Error fetching invoice details');
        }
    };

    const handleViewStatusHistory = async (invoice: InvoiceResponse) => {
        setStatusHistoryInvoice(invoice);
        setStatusHistory([]);
        setLoadingStatusHistory(true);

        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${invoice.id}/status-history`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setStatusHistory(Array.isArray(data) ? data : []);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch invoice status history'));
                setStatusHistoryInvoice(null);
            }
        } catch (err) {
            console.error('Error fetching invoice status history:', err);
            showError('Error fetching invoice status history');
            setStatusHistoryInvoice(null);
        } finally {
            setLoadingStatusHistory(false);
        }
    };

    const handlePayFromBalance = async () => {
        if (!selectedInvoice) return;

        setLoading(true);

        try {
            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${selectedInvoice.invoice.id}/pay-from-balance`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                showSuccess(`Invoice paid from subscriber credit balance successfully`);
                // Refresh invoice data to show updated status
                await handleViewInvoice(selectedInvoice.invoice.id);
                // Refresh invoices list
                fetchInvoices(hasActiveFilters);
                // Refresh subscriber credit balance to show updated amount
                if (selectedInvoice) {
                    await fetchSubscriberBalance(selectedInvoice.invoice.subscriberId);
                }
                // Trigger subscriber list refresh in Subscribers component
                window.dispatchEvent(new CustomEvent('subscriber-refresh-needed'));
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to pay invoice from credit balance'));
            }
        } catch (err) {
            console.error(err);
            showError('Error paying invoice from credit balance');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateInvoiceNotes = async () => {
        if (!selectedInvoice) return;

        setLoading(true);

        try {
            const request: InvoiceNotesUpdateRequest = {
                notes: notesInput.trim() || undefined
            };

            const response = await fetch(`${API_CONFIG.INVOICES_URL}/${selectedInvoice.invoice.id}/notes`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                showSuccess('Invoice notes updated successfully');
                setEditingNotes(false);
                // Refresh invoice data to show updated notes
                await handleViewInvoice(selectedInvoice.invoice.id);
                // Refresh invoices list to show updated notes
                fetchInvoices(hasActiveFilters);
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to update invoice notes'));
            }
        } catch (err) {
            console.error(err);
            showError('Error updating invoice notes');
        } finally {
            setLoading(false);
        }
    };

    const useSuggestedPeriod = () => {
        const resolvedPeriod = resolveSuggestedInvoicePeriod(suggestion);
        if (resolvedPeriod) {
            setFromMonth(resolvedPeriod.fromMonth);
            setToMonth(resolvedPeriod.toMonth);
            setShowGenerateForm(true);
        }
    };

    const handleSubscriberChange = (subscriberId: string, checked: boolean) => {
        if (checked) {
            setSelectedSubscribers([...selectedSubscribers, subscriberId]);
        } else {
            setSelectedSubscribers(selectedSubscribers.filter(id => id !== subscriberId));
        }
    };

    const handleFilterChange = (field: keyof InvoiceFilterRequest, value: string) => {
        setFilters(prev => ({
            ...prev,
            [field]: value || undefined
        }));
    };

    const applyFilters = async () => {
        setLoading(true);
        await fetchInvoices(true);
        setLoading(false);
        setShowFilterForm(false);
    };

    const clearFilters = async () => {
        setFilters({});
        setLoading(true);
        await fetchInvoices(false);
        setLoading(false);
        setShowFilterForm(false);
    };

    const hasActiveFilters = Object.keys(filters).some(key => {
        const value = filters[key as keyof InvoiceFilterRequest];
        return value !== undefined && value !== '';
    });

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {year: 'numeric', month: 'long'});
    };

    const formatDateTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusChangedAtLabel = (invoice: Pick<InvoiceResponse, 'status'>) =>
        invoice.status === 'PAID' ? 'Paid at' : 'Status changed';

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'sent':
                return '#28a745';
            case 'draft':
                return '#ffc107';
            case 'paid':
                return '#007bff';
            case 'void':
                return '#dc3545';
            default:
                return '#6c757d';
        }
    };

    const getOriginColor = (origin: string) => {
        switch (origin) {
            case 'SUBSCRIPTION_LEDGER':
                return '#17a2b8';
            case 'OUTSTANDING_BALANCE':
                return '#fd7e14';
            case 'MANUAL':
                return '#6f42c1';
            default:
                return '#6c757d';
        }
    };

    const formatOrigin = (origin: string) => {
        switch (origin) {
            case 'SUBSCRIPTION_LEDGER':
                return 'Subscription Ledger';
            case 'OUTSTANDING_BALANCE':
                return 'Outstanding Balance';
            case 'MANUAL':
                return 'Manual';
            default:
                return origin;
        }
    };

    const formatInvoicePeriod = (invoice: Pick<InvoiceResponse, 'fromMonth' | 'toMonth' | 'origin'>) => {
        if (invoice.origin === 'MANUAL' && invoice.fromMonth === invoice.toMonth) {
            return formatDate(invoice.fromMonth);
        }

        return `${formatDate(invoice.fromMonth)} - ${formatDate(invoice.toMonth)}`;
    };

    const canDeleteInvoice = (invoice: InvoiceResponse) =>
        invoice.status === 'DRAFT' && (invoice.origin === 'OUTSTANDING_BALANCE' || invoice.origin === 'MANUAL');

    const isInvoiceVoid = (invoice: Pick<InvoiceResponse, 'status'>) => invoice.status === 'VOID';

    const isInvoicePaid = (invoice: Pick<InvoiceResponse, 'status'>) => invoice.status === 'PAID';

    const isInvoiceClosed = (invoice: Pick<InvoiceResponse, 'status'>) =>
        isInvoicePaid(invoice) || isInvoiceVoid(invoice);

    const canVoidInvoice = (invoice: Pick<InvoiceResponse, 'status'>) =>
        invoice.status === 'SENT';

    const selectedSubscriberName = subscribers.find(
        (subscriber) => subscriber.id === manualInvoiceData.subscriberId
    )?.name;
    const resolvedSuggestedPeriod = resolveSuggestedInvoicePeriod(suggestion);
    const draftEmailPreviewTotal = draftEmailPreviewInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const draftBalancePaymentItems = draftBalancePaymentResult?.items ?? [];

    return (
        <div className="invoices">
            <div className="invoices-header">
                <h3>Invoices</h3>
                <div className="header-actions">
                    <button onClick={() => setShowFilterForm(true)} className="btn btn-secondary">
                        {hasActiveFilters ? '🔍 Filters (Active)' : '🔍 Filters'}
                    </button>
                    <button onClick={() => setShowManualInvoiceForm(true)} className="btn btn-info">
                        Create Manual Invoice
                    </button>
                    <button onClick={handlePreviewDraftInvoices} className="btn btn-success"
                            disabled={loadingDraftInvoicePreview || emailingDraftInvoices}>
                        {loadingDraftInvoicePreview ? 'Loading Drafts...' : emailingDraftInvoices ? 'Sending Draft Emails...' : 'Email Draft Invoices'}
                    </button>
                    <button onClick={openDraftBalancePaymentModal} className="btn btn-warning"
                            disabled={payingDraftInvoicesFromBalance}>
                        {payingDraftInvoicesFromBalance ? 'Paying Drafts...' : 'Pay drafts from credit'}
                    </button>
                    <button onClick={() => setShowGenerateForm(true)} className="btn btn-primary">
                        Generate Invoices
                    </button>
                </div>
            </div>

            {suggestion && (
                <div className="suggestion-banner">
                    <p><strong>Suggested
                        Period:</strong> {resolvedSuggestedPeriod ? `${formatDate(resolvedSuggestedPeriod.fromMonth)} - ${formatDate(resolvedSuggestedPeriod.toMonth)}` : '-'}
                    </p>
                    {suggestion.lastInvoicedToMonth && (
                        <p><em>Last invoiced to: {formatDate(suggestion.lastInvoicedToMonth)}</em></p>
                    )}
                    <button type="button" onClick={useSuggestedPeriod} className="btn btn-sm btn-secondary"
                            disabled={!resolvedSuggestedPeriod}>
                        Use Suggested Period
                    </button>
                </div>
            )}

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
                                        <strong>Period:</strong> {formatInvoicePeriod(invoice)}
                                    </p>
                                    <p><strong>Amount:</strong> ₴{invoice.totalAmount.toFixed(2)}</p>
                                    <p><strong>Status:</strong> <span className="status-badge"
                                                                      style={{backgroundColor: getStatusColor(invoice.status)}}>{invoice.status}</span>
                                    </p>
                                    <p>
                                        <strong>{getStatusChangedAtLabel(invoice)}:</strong> {formatDateTime(invoice.statusChangedAt)}
                                    </p>
                                    <p><strong>Origin:</strong> <span className="status-badge"
                                                               style={{backgroundColor: getOriginColor(invoice.origin)}}>{formatOrigin(invoice.origin)}</span>
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
                                    <button onClick={() => handleEmailInvoice(invoice.id, invoice.subscriberName)}
                                            className="btn btn-sm btn-info"
                                            disabled={emailingInvoices.has(invoice.id) || isInvoiceVoid(invoice)}>
                                        {emailingInvoices.has(invoice.id) ? 'Sending...' : '📧 Email'}
                                    </button>
                                    <button onClick={() => handleDownloadPdf(invoice.id)}
                                            className="btn btn-sm btn-primary">
                                        Download PDF
                                    </button>
                                    <button onClick={() => handleViewStatusHistory(invoice)}
                                            className="btn btn-sm btn-outline-secondary"
                                            disabled={loadingStatusHistory && statusHistoryInvoice?.id === invoice.id}>
                                        {loadingStatusHistory && statusHistoryInvoice?.id === invoice.id ? 'Loading...' : 'Status History'}
                                    </button>
                                    <label className="invoice-status-control">
                                        <span>Status</span>
                                        <select
                                            value={invoice.status}
                                            onChange={(event) => handleUpdateInvoiceStatus(invoice.id, event.target.value as InvoiceStatus)}
                                            disabled={updatingInvoiceStatuses.has(invoice.id)}
                                        >
                                            {INVOICE_STATUS_OPTIONS.map(status => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </label>
                                    {canVoidInvoice(invoice) && (
                                        <button onClick={() => openVoidModal(invoice)}
                                                className="btn btn-sm btn-warning">
                                            Void
                                        </button>
                                    )}
                                    {canDeleteInvoice(invoice) && (
                                        <button onClick={() => openDeleteModal(invoice)}
                                                className="btn btn-sm btn-danger">
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {(showGenerateForm) && createPortal(
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
                </div>,
                document.body
            )}

            {showManualInvoiceForm && createPortal(
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>Create Manual Invoice</h3>
                        <form onSubmit={handleCreateManualInvoice}>
                            <div className="manual-invoice-help">
                                Create a one-off invoice without subscription ledger calculations. Use this for pre-system debt instead of negative subscriber credit.
                            </div>

                            <div className="form-group">
                                <label htmlFor="manualSubscriberId">Subscriber</label>
                                <select
                                    id="manualSubscriberId"
                                    value={manualInvoiceData.subscriberId}
                                    onChange={(e) => setManualInvoiceData((prev) => ({
                                        ...prev,
                                        subscriberId: e.target.value
                                    }))}
                                    required
                                >
                                    <option value="">Select subscriber</option>
                                    {subscribers.map((subscriber) => (
                                        <option key={subscriber.id} value={subscriber.id}>
                                            {subscriber.name} ({subscriber.email})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="manualAmount">Amount (UAH)</label>
                                    <input
                                        type="number"
                                        id="manualAmount"
                                        min="1"
                                        step="1"
                                        value={manualInvoiceData.amount}
                                        onChange={(e) => setManualInvoiceData((prev) => ({
                                            ...prev,
                                            amount: e.target.value
                                        }))}
                                        placeholder="0"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="manualInvoiceMonth">Invoice Month</label>
                                    <input
                                        type="month"
                                        id="manualInvoiceMonth"
                                        value={manualInvoiceData.invoiceMonth}
                                        onChange={(e) => setManualInvoiceData((prev) => ({
                                            ...prev,
                                            invoiceMonth: e.target.value
                                        }))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="manualNotes">Note</label>
                                <textarea
                                    id="manualNotes"
                                    value={manualInvoiceData.notes}
                                    onChange={(e) => setManualInvoiceData((prev) => ({
                                        ...prev,
                                        notes: e.target.value
                                    }))}
                                    placeholder="What is this invoice for?"
                                    rows={4}
                                    className="notes-textarea"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={manualInvoiceData.sendEmail}
                                        onChange={(e) => setManualInvoiceData((prev) => ({
                                            ...prev,
                                            sendEmail: e.target.checked
                                        }))}
                                    />
                                    Send invoice email immediately
                                </label>
                                {selectedSubscriberName && (
                                    <small className="form-help">
                                        The invoice will be created for {selectedSubscriberName}.
                                    </small>
                                )}
                            </div>

                            <div className="form-actions">
                                <button type="submit" disabled={loading} className="btn btn-success">
                                    {loading ? 'Creating...' : 'Create Manual Invoice'}
                                </button>
                                <button type="button" onClick={closeManualInvoiceForm}
                                        className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {(showFilterForm) && createPortal(
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>Filter Invoices</h3>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            applyFilters();
                        }}>
                            <div className="form-group">
                                <label htmlFor="subscriberId">Subscriber</label>
                                <select
                                    id="subscriberId"
                                    value={filters.subscriberId || ''}
                                    onChange={(e) => handleFilterChange('subscriberId', e.target.value)}
                                    className="form-control"
                                >
                                    <option value="">All Subscribers</option>
                                    {subscribers.map((subscriber) => (
                                        <option key={subscriber.id} value={subscriber.id}>
                                            {subscriber.name} ({subscriber.email})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor="status">Status</label>
                                <select
                                    id="status"
                                    value={filters.status || ''}
                                    onChange={(e) => handleFilterChange('status', e.target.value)}
                                    className="form-control"
                                >
                                    <option value="">All Statuses</option>
                                    <option value="DRAFT">Draft</option>
                                    <option value="SENT">Sent</option>
                                    <option value="PAID">Paid</option>
                                    <option value="VOID">Void</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor="origin">Origin</label>
                                <select
                                    id="origin"
                                    value={filters.origin || ''}
                                    onChange={(e) => handleFilterChange('origin', e.target.value)}
                                    className="form-control"
                                >
                                    <option value="">All Origins</option>
                                    <option value="SUBSCRIPTION_LEDGER">Subscription Ledger</option>
                                    <option value="OUTSTANDING_BALANCE">Outstanding Balance</option>
                                    <option value="MANUAL">Manual</option>
                                </select>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="dateFrom">Date From</label>
                                    <input
                                        type="date"
                                        id="dateFrom"
                                        value={filters.dateFrom || ''}
                                        onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                                        className="form-control"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="dateTo">Date To</label>
                                    <input
                                        type="date"
                                        id="dateTo"
                                        value={filters.dateTo || ''}
                                        onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                                        min={filters.dateFrom || ''}
                                        className="form-control"
                                    />
                                </div>
                            </div>

                            <div className="form-actions">
                                <button type="submit" disabled={loading} className="btn btn-primary">
                                    {loading ? 'Applying...' : 'Apply Filters'}
                                </button>
                                <button type="button" onClick={clearFilters} className="btn btn-secondary">
                                    Clear Filters
                                </button>
                                <button type="button" onClick={() => setShowFilterForm(false)}
                                        className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {showDraftEmailPreview && createPortal(
                <div className="form-overlay">
                    <div className="form-container draft-email-preview">
                        <h3>Email Draft Invoices</h3>
                        <div className="draft-email-summary">
                            <p>
                                <strong>{draftEmailPreviewInvoices.length}</strong> draft invoices found.
                            </p>
                            <p>
                                <strong>Total:</strong> ₴{draftEmailPreviewTotal.toFixed(2)}
                            </p>
                        </div>

                        {draftEmailPreviewInvoices.length > 0 ? (
                            <div className="draft-email-list">
                                {draftEmailPreviewInvoices.map((invoice) => (
                                    <div key={invoice.id} className="draft-email-row">
                                        <div>
                                            <strong>{invoice.subscriberName}</strong>
                                            <span>{formatInvoicePeriod(invoice)}</span>
                                        </div>
                                        <div>
                                            <strong>₴{invoice.totalAmount.toFixed(2)}</strong>
                                            {invoice.emailSent && <span>Email already sent</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-ledger-state">
                                No draft invoices are available to email.
                            </div>
                        )}

                        <div className="form-actions">
                            <button
                                onClick={handleEmailDraftInvoices}
                                className="btn btn-success"
                                disabled={emailingDraftInvoices || draftEmailPreviewInvoices.length === 0}
                            >
                                {emailingDraftInvoices ? 'Sending...' : 'Send to All Drafts'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowDraftEmailPreview(false);
                                    setDraftEmailPreviewInvoices([]);
                                }}
                                className="btn btn-secondary"
                                disabled={emailingDraftInvoices}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showDraftBalancePaymentModal && createPortal(
                <div className="form-overlay">
                    <div className="form-container draft-balance-payment-modal">
                        <h3>Pay draft invoices from credit balance?</h3>

                        {!draftBalancePaymentResult ? (
                            <>
                                <p className="draft-balance-payment-copy">
                                    This will check all DRAFT invoices and pay the ones fully covered by subscriber
                                    credit balance. Credit balances will be reduced by the invoice amount. Invoices
                                    without enough credit will be skipped. No emails will be sent.
                                </p>

                                <div className="form-actions">
                                    <button
                                        onClick={handlePayDraftInvoicesFromBalance}
                                        className="btn btn-warning"
                                        disabled={payingDraftInvoicesFromBalance}
                                    >
                                        {payingDraftInvoicesFromBalance ? 'Paying...' : 'Pay covered drafts'}
                                    </button>
                                    <button
                                        onClick={closeDraftBalancePaymentModal}
                                        className="btn btn-secondary"
                                        disabled={payingDraftInvoicesFromBalance}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="draft-balance-payment-summary">
                                    <p>{getDraftBalancePaymentSummary(draftBalancePaymentResult)}</p>
                                </div>

                                {draftBalancePaymentItems.length > 0 && (
                                    <div className="draft-balance-payment-results">
                                        <div className="draft-balance-payment-header">
                                            <span>Subscriber</span>
                                            <span>Invoice amount</span>
                                            <span>Credit before</span>
                                            <span>Credit after</span>
                                            <span>Result</span>
                                            <span>Message</span>
                                        </div>
                                        {draftBalancePaymentItems.map((item) => (
                                            <div key={item.invoiceId} className="draft-balance-payment-row">
                                                <span>{item.subscriberName}</span>
                                                <span>₴{item.invoiceAmount.toFixed(2)}</span>
                                                <span>₴{item.balanceBefore.toFixed(2)}</span>
                                                <span>₴{item.balanceAfter.toFixed(2)}</span>
                                                <span className={`draft-balance-payment-result draft-balance-payment-result-${getDraftBalancePaymentItemResult(item).toLowerCase()}`}>
                                                    {getDraftBalancePaymentItemResult(item)}
                                                </span>
                                                <span>{item.message}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="form-actions">
                                    <button onClick={closeDraftBalancePaymentModal} className="btn btn-secondary">
                                        Close
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {selectedInvoice && createPortal(
                <div className="form-overlay">
                    <div className="form-container invoice-detail">
                        <h3>Invoice Details</h3>
                        <div className="invoice-detail-info">
                            <h4>{selectedInvoice.invoice.subscriberName}</h4>
                            <p><strong>Invoice ID:</strong> {selectedInvoice.invoice.id}</p>
                            <p>
                                <strong>Period:</strong> {formatInvoicePeriod(selectedInvoice.invoice)}
                            </p>
                            <p><strong>Total Amount:</strong> ₴{selectedInvoice.invoice.totalAmount.toFixed(2)}</p>
                            <p><strong>Status:</strong> <span className="status-badge"
                                                              style={{backgroundColor: getStatusColor(selectedInvoice.invoice.status)}}>{selectedInvoice.invoice.status}</span>
                            </p>
                            <p>
                                <strong>{getStatusChangedAtLabel(selectedInvoice.invoice)}:</strong> {formatDateTime(selectedInvoice.invoice.statusChangedAt)}
                            </p>
                            <p><strong>Origin:</strong> <span className="status-badge"
                                                       style={{backgroundColor: getOriginColor(selectedInvoice.invoice.origin)}}>{formatOrigin(selectedInvoice.invoice.origin)}</span>
                            </p>
                            <p><strong>Created:</strong> {formatDate(selectedInvoice.invoice.createdAt)}</p>
                            <div className="notes-section">
                                <p><strong>Notes:</strong></p>
                                {editingNotes ? (
                                    <div className="notes-edit-form">
                                        <textarea
                                            value={notesInput}
                                            onChange={(e) => setNotesInput(e.target.value)}
                                            placeholder="Add invoice notes..."
                                            rows={3}
                                            className="notes-textarea"
                                        />
                                        <div className="notes-edit-actions">
                                            <button 
                                                onClick={handleUpdateInvoiceNotes}
                                                disabled={loading}
                                                className="btn btn-sm btn-success"
                                            >
                                                {loading ? 'Saving...' : 'Save'}
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    setEditingNotes(false);
                                                    setNotesInput(selectedInvoice.invoice.notes || '');
                                                }}
                                                className="btn btn-sm btn-secondary"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="notes-display">
                                        <p>{selectedInvoice.invoice.notes || <em>No notes</em>}</p>
                                        <button 
                                            onClick={() => {
                                                setEditingNotes(true);
                                                setNotesInput(selectedInvoice.invoice.notes || '');
                                            }}
                                            className="btn btn-sm btn-outline-secondary"
                                        >
                                            Edit Notes
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <h5>Ledger Entries ({selectedInvoice.entries.length})</h5>
                        {selectedInvoice.entries.length > 0 ? (
                            <div className="ledger-entries">
                                {selectedInvoice.entries.map((entry) => (
                                    <div key={entry.ledgerEntryId} className="ledger-entry">
                                        <p><strong>Service:</strong> {entry.subscriptionServiceName}</p>
                                        <p><strong>Month:</strong> {formatDate(entry.recordedMonth)}</p>
                                        <p><strong>Amount:</strong> ₴{entry.amount.toFixed(2)}</p>
                                        <p><strong>Participants:</strong> {entry.participantCount}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-ledger-state">
                                {selectedInvoice.invoice.origin === 'MANUAL'
                                    ? 'This invoice was created manually and has no ledger entries.'
                                    : 'No ledger entries linked to this invoice.'}
                            </div>
                        )}

                        <div className="form-actions">
                            <button onClick={() => handleEmailInvoiceFromDetail(selectedInvoice.invoice.id, selectedInvoice.invoice.subscriberName)}
                                    className="btn btn-info"
                                    disabled={emailingDetailInvoice || isInvoiceVoid(selectedInvoice.invoice)}>
                                {emailingDetailInvoice ? 'Sending...' : '📧 Email Invoice'}
                            </button>
                            {canVoidInvoice(selectedInvoice.invoice) && (
                                <button onClick={() => openVoidModal(selectedInvoice.invoice)}
                                        className="btn btn-warning">
                                    Void Invoice
                                </button>
                            )}
                            {canDeleteInvoice(selectedInvoice.invoice) && (
                                <button onClick={() => openDeleteModal(selectedInvoice.invoice)}
                                        className="btn btn-danger">
                                    Delete Invoice
                                </button>
                            )}
                            <label className="invoice-status-control invoice-status-control-detail">
                                <span>Status</span>
                                <select
                                    value={selectedInvoice.invoice.status}
                                    onChange={(event) => handleUpdateInvoiceStatus(selectedInvoice.invoice.id, event.target.value as InvoiceStatus)}
                                    disabled={updatingInvoiceStatuses.has(selectedInvoice.invoice.id)}
                                >
                                    {INVOICE_STATUS_OPTIONS.map(status => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </label>
                            {!isInvoiceClosed(selectedInvoice.invoice) &&
                                subscriberBalance !== null &&
                                subscriberBalance > selectedInvoice.invoice.totalAmount && (
                                    <button onClick={handlePayFromBalance}
                                            className="btn btn-info"
                                            disabled={loading}>
                                        Pay from Credit (₴{subscriberBalance.toFixed(2)} available)
                                    </button>
                                )}
                            <button onClick={() => handleDownloadPdf(selectedInvoice.invoice.id)}
                                    className="btn btn-primary">
                                Download PDF
                            </button>
                            <button onClick={() => handleViewStatusHistory(selectedInvoice.invoice)}
                                    className="btn btn-outline-secondary"
                                    disabled={loadingStatusHistory && statusHistoryInvoice?.id === selectedInvoice.invoice.id}>
                                {loadingStatusHistory && statusHistoryInvoice?.id === selectedInvoice.invoice.id ? 'Loading...' : 'Status History'}
                            </button>
                            <button onClick={() => {
                                setSelectedInvoice(null);
                                setSubscriberBalance(null);
                            }} className="btn btn-secondary">
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {statusHistoryInvoice && createPortal(
                <div className="form-overlay">
                    <div className="form-container status-history-modal">
                        <h3>Status History</h3>
                        <div className="status-history-summary">
                            <p><strong>Subscriber:</strong> {statusHistoryInvoice.subscriberName}</p>
                            <p><strong>Invoice ID:</strong> {statusHistoryInvoice.id}</p>
                            <p><strong>Current status:</strong> <span className="status-badge"
                                                                      style={{backgroundColor: getStatusColor(statusHistoryInvoice.status)}}>{statusHistoryInvoice.status}</span>
                            </p>
                        </div>

                        {loadingStatusHistory ? (
                            <div className="empty-ledger-state">Loading status history...</div>
                        ) : statusHistory.length > 0 ? (
                            <div className="status-history-list">
                                {statusHistory.map((item) => (
                                    <div key={item.actionId} className="status-history-item">
                                        <div className="status-history-transition">
                                            {item.statusBefore ? (
                                                <span className="status-badge"
                                                      style={{backgroundColor: getStatusColor(item.statusBefore)}}>{item.statusBefore}</span>
                                            ) : (
                                                <span>Created</span>
                                            )}
                                            <span>&rArr;</span>
                                            <span className="status-badge"
                                                  style={{backgroundColor: getStatusColor(item.statusAfter)}}>{item.statusAfter}</span>
                                        </div>
                                        <p><strong>Changed:</strong> {formatDateTime(item.changedAt)}</p>
                                        <p><strong>Changed by:</strong> {item.changedByAccountId}</p>
                                        <p><strong>Action:</strong> {item.actionType}</p>
                                        <p>{item.summary}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-ledger-state">No status changes found.</div>
                        )}

                        <div className="form-actions">
                            <button onClick={() => {
                                setStatusHistoryInvoice(null);
                                setStatusHistory([]);
                            }} className="btn btn-secondary">
                                Close
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showVoidModal && voidInvoiceData && createPortal(
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>Void Invoice</h3>
                        <p>Subscriber: <strong>{voidInvoiceData.subscriberName}</strong></p>
                        <p className="warning-text">
                            This invoice will be marked as VOID and will no longer be payable or included in unpaid balances.
                        </p>

                        <div className="form-group">
                            <label htmlFor="voidReason">Reason (optional)</label>
                            <textarea
                                id="voidReason"
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                rows={3}
                                className="notes-textarea"
                                placeholder="Why is this invoice being voided?"
                            />
                        </div>

                        <div className="form-actions">
                            <button
                                onClick={handleVoidInvoice}
                                className="btn btn-warning"
                                disabled={loading}
                            >
                                {loading ? 'Voiding...' : 'Void Invoice'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowVoidModal(false);
                                    setVoidInvoiceData(null);
                                    setVoidReason('');
                                }}
                                className="btn btn-secondary"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Invoice Modal */}
            {showDeleteModal && deleteInvoiceData && createPortal(
                <div className="form-overlay">
                    <div className="form-container">
                        <h3>Delete Draft Invoice</h3>
                        <p>Subscriber: <strong>{deleteInvoiceData.subscriberName}</strong></p>
                        <p className="warning-text">
                            This action cannot be undone. The invoice will be permanently deleted.
                        </p>

                        {deleteInvoiceData.origin === 'OUTSTANDING_BALANCE' ? (
                            <div className="form-group">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={deleteInvoiceData.addToBalance}
                                        onChange={(e) => setDeleteInvoiceData({
                                            ...deleteInvoiceData,
                                            addToBalance: e.target.checked
                                        })}
                                    />
                                    Restore legacy balance debt to subscriber's account
                                </label>
                                <small className="form-help">
                                    When checked, this legacy invoice amount will be restored as negative balance debt.
                                    When unchecked, the invoice is removed without affecting subscriber credit.
                                </small>
                            </div>
                        ) : (
                            <small className="form-help">
                                Manual invoices are removed without touching subscriber credit.
                            </small>
                        )}

                        <div className="form-actions">
                            <button
                                onClick={handleDeleteInvoice}
                                className="btn btn-danger"
                                disabled={loading}
                            >
                                {loading ? 'Deleting...' : 'Delete Invoice'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setDeleteInvoiceData(null);
                                }}
                                className="btn btn-secondary"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
