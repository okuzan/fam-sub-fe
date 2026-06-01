import {useMemo, useState} from 'react';
import {Link, Navigate, useLocation} from 'react-router-dom';
import SubscriptionServices from './SubscriptionServices';
import Subscribers from './Subscribers';
import Charges from './Charges';
import Memberships from './Memberships';
import Ledger from './Ledger';
import Invoices from './Invoices';
import AdminActions from './AdminActions';
import AdminInvites from './AdminInvites';
import TelegramPosts from './TelegramPosts';
import './SubscriptionServices.css';
import './Subscribers.css';
import './Charges.css';
import './Memberships.css';
import './CostCalculations.css';
import './Ledger.css';
import './Invoices.css';
import './AdminActions.css';
import './AdminInvites.css';
import './TelegramPosts.css';

interface AdminDashboardProps {
    onLogout?: () => void;
    userEmail?: string | null;
    userRoles?: string[];
}

type AdminSectionKey =
    | 'services'
    | 'subscribers'
    | 'memberships'
    | 'charges'
    | 'ledger'
    | 'invoices'
    | 'admin-invites'
    | 'admin-actions'
    | 'telegram-posts'
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
        key: 'ledger',
        title: 'Ledger',
        description: 'Generate and browse ledger entries',
        path: '/admin/ledger'
    },
    {key: 'invoices', title: 'Invoices', description: 'Generate, filter, and manage invoices', path: '/admin/invoices'},
    {
        key: 'admin-invites',
        title: 'Admin Access',
        description: 'Manage accounts and administrator invitations',
        path: '/admin/invites'
    },
    {
        key: 'admin-actions',
        title: 'Admin Actions',
        description: 'Review cost and invoice generation history',
        path: '/admin/actions'
    },
    {
        key: 'telegram-posts',
        title: 'Telegram Posts',
        description: 'Generate templated update posts for Telegram channel',
        path: '/admin/telegram-posts'
    },
    {key: 'profile', title: 'Profile & Settings', description: 'Account details and logout', path: '/admin/profile'},
];

const formatRole = (role: string) => {
    const normalized = role.replace(/^ROLE_/i, '').toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export default function AdminDashboard({onLogout, userEmail, userRoles = []}: AdminDashboardProps) {
    const [isLoading, setIsLoading] = useState(false);
    const location = useLocation();
    const canAccessSubscriberCabinet = userRoles.some((role) => role.replace(/^ROLE_/i, '').toLowerCase() === 'subscriber');

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
        if (path === '/admin/cost-calculations') return <Navigate to="/admin/ledger" replace/>;
        if (path === '/admin/ledger') return <Ledger/>;
        if (path === '/admin/invoices') return <Invoices/>;
        if (path === '/admin/invites') return <AdminInvites/>;
        if (path === '/admin/actions') return <AdminActions/>;
        if (path === '/admin/telegram-posts') return <TelegramPosts/>;
        if (path === '/admin/profile') {
            return (
                <div className="admin-profile-card">
                    <h3>Profile</h3>
                    <p><strong>Roles:</strong> {userRoles.length > 0 ? userRoles.map(formatRole).join(', ') : 'Administrator'}</p>
                    <p><strong>Email:</strong> {userEmail ?? 'Unknown'}</p>
                    <div className="admin-profile-actions">
                        {canAccessSubscriberCabinet && (
                            <Link to="/subscriber/cabinet" className="admin-profile-link">
                                Subscriber cabinet
                            </Link>
                        )}
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
                        {canAccessSubscriberCabinet && (
                            <Link
                                to="/subscriber/cabinet"
                                className="admin-home-card admin-home-card-secondary"
                            >
                                <h3>Subscriber Cabinet</h3>
                                <p>Open your personal subscriptions, balances, and invoices.</p>
                            </Link>
                        )}
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
