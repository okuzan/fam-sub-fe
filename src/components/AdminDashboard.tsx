import {useMemo, useState} from 'react';
import SubscriptionServices from './SubscriptionServices';
import Subscribers from './Subscribers';
import Charges from './Charges';
import Memberships from './Memberships';
import CostCalculations from './CostCalculations';
import Invoices from './Invoices';
import './SubscriptionServices.css';
import './Subscribers.css';
import './Charges.css';
import './Memberships.css';
import './CostCalculations.css';
import './Invoices.css';

interface AdminDashboardProps {
    onLogout?: () => void;
    userEmail?: string | null;
}

type AdminSectionKey =
    | 'services'
    | 'subscribers'
    | 'memberships'
    | 'charges'
    | 'cost-calculations'
    | 'invoices'
    | 'profile';

interface SectionConfig {
    key: AdminSectionKey;
    title: string;
    description: string;
}

const SECTION_CONFIGS: SectionConfig[] = [
    {key: 'services', title: 'Subscription Services', description: 'Manage available services and prices'},
    {key: 'subscribers', title: 'Subscribers', description: 'Manage subscriber data and balances'},
    {key: 'memberships', title: 'Memberships', description: 'Manage subscriber-service memberships'},
    {key: 'charges', title: 'Charges', description: 'Manage generated and manual charges'},
    {key: 'cost-calculations', title: 'Cost Calculations', description: 'Review and calculate service costs'},
    {key: 'invoices', title: 'Invoices', description: 'Generate, filter, and manage invoices'},
    {key: 'profile', title: 'Profile & Settings', description: 'Account details and logout'},
];

export default function AdminDashboard({onLogout, userEmail}: AdminDashboardProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [activeSection, setActiveSection] = useState<AdminSectionKey | null>(null);

    const handleLogout = async () => {
        setIsLoading(true);
        onLogout?.();
    };

    const currentSection = useMemo(
        () => SECTION_CONFIGS.find((section) => section.key === activeSection) ?? null,
        [activeSection]
    );

    const renderSectionContent = () => {
        switch (activeSection) {
            case 'services':
                return <SubscriptionServices/>;
            case 'subscribers':
                return <Subscribers/>;
            case 'memberships':
                return <Memberships/>;
            case 'charges':
                return <Charges/>;
            case 'cost-calculations':
                return <CostCalculations/>;
            case 'invoices':
                return <Invoices/>;
            case 'profile':
                return (
                    <div className="admin-profile-card">
                        <h3>Profile</h3>
                        <p><strong>Role:</strong> Administrator</p>
                        <p><strong>Email:</strong> {userEmail ?? 'Unknown'}</p>
                        <div className="admin-profile-actions">
                            <button
                                onClick={handleLogout}
                                disabled={isLoading}
                                className="logout-btn"
                            >
                                {isLoading ? 'Logging out...' : 'Logout'}
                            </button>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="admin-dashboard">
            <div className="admin-header">
                <h1>Admin Dashboard</h1>
                <p>{activeSection ? currentSection?.title : 'Welcome, Administrator'}</p>
            </div>

            <div className="admin-content">
                {!activeSection ? (
                    <div className="admin-home-grid">
                        {SECTION_CONFIGS.map((section) => (
                            <button
                                key={section.key}
                                type="button"
                                className="admin-home-card"
                                onClick={() => setActiveSection(section.key)}
                            >
                                <h3>{section.title}</h3>
                                <p>{section.description}</p>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="admin-section-page">
                        <div className="admin-section-nav">
                            <button
                                type="button"
                                className="admin-btn"
                                onClick={() => setActiveSection(null)}
                            >
                                ← Back to Home
                            </button>
                        </div>

                        <div className="admin-section-content">
                            {renderSectionContent()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
