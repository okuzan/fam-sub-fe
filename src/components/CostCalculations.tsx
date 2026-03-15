import {useEffect, useState} from 'react';
import {API_CONFIG} from '../config/api';
import type {
    CostCalculationBatchResponse,
    CostCalculationRequest,
    CostCalculationSuggestion
} from '../types/costCalculation';

export default function CostCalculations() {
    const [suggestion, setSuggestion] = useState<CostCalculationSuggestion | null>(null);
    const [fromMonth, setFromMonth] = useState('');
    const [toMonth, setToMonth] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [recentCalculations, setRecentCalculations] = useState<CostCalculationBatchResponse[]>([]);

    useEffect(() => {
        fetchSuggestedPeriod();
        fetchRecentCalculations();
    }, []);

    const fetchSuggestedPeriod = async () => {
        try {
            const response = await fetch(`${API_CONFIG.COST_CALCULATIONS_URL}/suggested-period`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSuggestion(data);
                setFromMonth(data.suggestedFromMonth);
                setToMonth(data.suggestedToMonth);
            }
        } catch (err) {
            console.error('Failed to fetch suggested period:', err);
        }
    };

    const fetchRecentCalculations = async () => {
        try {
            // This endpoint might not exist yet, but we'll try to get recent calculations
            const response = await fetch(API_CONFIG.COST_CALCULATIONS_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setRecentCalculations(Array.isArray(data) ? data.slice(0, 5) : []);
            }
        } catch (err) {
            console.error('Failed to fetch recent calculations:', err);
        }
    };

    const handleCalculate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const request: CostCalculationRequest = {
                fromMonth,
                toMonth
            };

            const response = await fetch(API_CONFIG.COST_CALCULATIONS_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify(request)
            });

            if (response.ok) {
                const result = await response.json();
                setSuccess(`Cost calculation completed for period ${formatDate(result.fromMonth)} - ${formatDate(result.toMonth)}`);
                fetchRecentCalculations();
            } else {
                setError('Failed to calculate costs');
            }
        } catch (err) {
            console.error(err);
            setError('Error calculating costs');
        } finally {
            setLoading(false);
        }
    };

    const useSuggestedPeriod = () => {
        if (suggestion) {
            setFromMonth(suggestion.suggestedFromMonth);
            setToMonth(suggestion.suggestedToMonth);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {year: 'numeric', month: 'long'});
    };

    return (
        <div className="cost-calculations">
            <div className="cost-calculations-header">
                <h3>Cost Calculations</h3>
                {suggestion && (
                    <div className="suggestion-banner">
                        <p><strong>Suggested
                            Period:</strong> {formatDate(suggestion.suggestedFromMonth)} - {formatDate(suggestion.suggestedToMonth)}
                        </p>
                        <p><em>{suggestion.reason}</em></p>
                        <button type="button" onClick={useSuggestedPeriod} className="btn btn-sm btn-secondary">
                            Use Suggested Period
                        </button>
                    </div>
                )}
            </div>

            <form onSubmit={handleCalculate} className="cost-calculation-form">
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

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                <div className="form-actions">
                    <button type="submit" disabled={loading} className="btn btn-primary">
                        {loading ? 'Calculating...' : 'Calculate Costs'}
                    </button>
                </div>
            </form>

            {recentCalculations.length > 0 && (
                <div className="recent-calculations">
                    <h4>Recent Calculations</h4>
                    <div className="calculations-list">
                        {recentCalculations.map((calc) => (
                            <div key={calc.id} className="calculation-item">
                                <div className="calculation-info">
                                    <p>
                                        <strong>Period:</strong> {formatDate(calc.fromMonth)} - {formatDate(calc.toMonth)}
                                    </p>
                                    <p><strong>Calculated:</strong> {new Date(calc.createdAt).toLocaleDateString()}</p>
                                    <p><strong>Batch ID:</strong> {calc.id.slice(0, 8)}...</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
