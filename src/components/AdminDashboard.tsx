import {useMemo, useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
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
    path: string;
}

const SECTION_CONFIGS: SectionConfig[] = [
    {
        key: 'services',
        title: 'Subscription Services',
        description: 'Manage available services and prices',
        path: '/admin/services'
    },
    {
        key: 'subscribers',
        title: 'Subscribers',
        description: 'Manage subscriber data and balances',
        path: '/admin/subscribers'
    },
    {
        key: 'memberships',
        title: 'Memberships',
        description: 'Manage subscriber-service memberships',
        path: '/admin/memberships'
    },
    {key: 'charges', title: 'Charges', description: 'Manage generated and manual charges', path: '/admin/charges'},
    {
        key: 'cost-calculations',
        title: 'Cost Calculations',
        description: 'Review and calculate service costs',
        path: '/admin/cost-calculations'
    },
    {key: 'invoices', title: 'Invoices', description: 'Generate, filter, and manage invoices', path: '/admin/invoices'},
    {key: 'profile', title: 'Profile & Settings', description: 'Account details and logout', path: '/admin/profile'},
];

export default function AdminDashboard({onLogout, userEmail}: AdminDashboardProps) {
    const [isLoading, setIsLoading] = useState(false);
    const location = useLocation();

    const handleLogout = async () => {
        setIsLoading(true);
        onLogout?.();
    };

    const currentSection = useMemo(
        () => SECTION_CONFIGS.find((section) => section.path === location.pathname) ?? null,
        [location.pathname]
    );

    const renderSectionContent = () => {
        const path = location.pathname;

        if (path === '/admin/services') return <SubscriptionServices/>;
        if (path === '/admin/subscribers') return <Subscribers/>;
        if (path === '/admin/memberships') return <Memberships/>;
        if (path === '/admin/charges') return <Charges/>;
        if (path === '/admin/cost-calculations') return <CostCalculations/>;
        if (path === '/admin/invoices') return <Invoices/>;
        if (path === '/admin/profile') {
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
        }
        return null;
    };

    const isHomePage = location.pathname === '/admin' || location.pathname === '/admin/';

    return (
        <div className="admin-dashboard">
            <div className="admin-header">
                <h1>Admin Dashboard</h1>
                <p>{!isHomePage ? currentSection?.title : 'Welcome, Administrator'}</p>
            </div>

            <div className="admin-content">
                {!isHomePage ? (
                    <div className="admin-section-page">
                        <div className="admin-section-nav">
                            <Link
                                to="/admin"
                                className="admin-btn"
                            >
                                ← Back to Home
                            </Link>
                        </div>

                        <div className="admin-section-content">
                            {renderSectionContent()}
                        </div>
                    </div>
                ) : (
                    <div className="admin-home-grid">
                        {SECTION_CONFIGS.map((section) => (
                            <Link
                                key={section.key}
                                to={section.path}
                                className="admin-home-card"
                            >
                                <h3>{section.title}</h3>
                                <p>{section.description}</p>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
