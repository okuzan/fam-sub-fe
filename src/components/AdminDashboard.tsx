import { useState } from 'react';
import SubscriptionServices from './SubscriptionServices';
import Subscribers from './Subscribers';
import Charges from './Charges';
import Memberships from './Memberships';
import './SubscriptionServices.css';
import './Subscribers.css';
import './Charges.css';
import './Memberships.css';

interface AdminDashboardProps {
    onLogout?: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleLogout = async () => {
        setIsLoading(true);
        onLogout?.();
    };

    return (
        <div className="admin-dashboard">
            <div className="admin-header">
                <h1>Admin Dashboard</h1>
                <p>Welcome, Administrator</p>
            </div>
            
            <div className="admin-content">
                <div className="admin-section">
                    <h2>Subscription Services Management</h2>
                    <SubscriptionServices />
                </div>

                <div className="admin-section">
                    <h2>Subscribers Management</h2>
                    <Subscribers />
                </div>

                <div className="admin-section">
                    <h2>Memberships Management</h2>
                    <Memberships />
                </div>

                <div className="admin-section">
                    <h2>Charges Management</h2>
                    <Charges />
                </div>
            </div>

            <div className="admin-footer">
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
