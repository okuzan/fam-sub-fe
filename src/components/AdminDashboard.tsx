import { useState } from 'react';
import SubscriptionServices from './SubscriptionServices';
import Subscribers from './Subscribers';
import Charges from './Charges';
import './SubscriptionServices.css';
import './Subscribers.css';
import './Charges.css';

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
                    <h2>Charges Management</h2>
                    <Charges />
                </div>

                <div className="admin-section">
                    <h2>User Management</h2>
                    <div className="admin-cards">
                        <div className="admin-card">
                            <h3>Total Users</h3>
                            <p className="card-value">--</p>
                        </div>
                        <div className="admin-card">
                            <h3>Active Sessions</h3>
                            <p className="card-value">--</p>
                        </div>
                    </div>
                </div>

                <div className="admin-section">
                    <h2>System Overview</h2>
                    <div className="admin-cards">
                        <div className="admin-card">
                            <h3>API Status</h3>
                            <p className="status-online">Online</p>
                        </div>
                        <div className="admin-card">
                            <h3>Database</h3>
                            <p className="status-online">Connected</p>
                        </div>
                    </div>
                </div>

                <div className="admin-section">
                    <h2>Quick Actions</h2>
                    <div className="admin-actions">
                        <button className="admin-btn" disabled>
                            View All Users
                        </button>
                        <button className="admin-btn" disabled>
                            System Logs
                        </button>
                        <button className="admin-btn" disabled>
                            Settings
                        </button>
                    </div>
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
