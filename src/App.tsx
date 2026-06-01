import {BrowserRouter as Router, Navigate, Route, Routes} from 'react-router-dom';
import {useEffect, useState} from 'react';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import SubscriberCabinet from './components/SubscriberCabinet';
import RoleChooser from './components/RoleChooser';
import {API_CONFIG} from './config/api';
import {ToastProvider} from './components/Toast';
import './App.css'
import './components/Login.css'
import './components/AdminDashboard.css'
import './components/RoleChooser.css'

interface AuthMeResponse {
    authenticated: boolean;
    accountId: string | null;
    email: string | null;
    roles: string[]; // Changed from Set<string> to string[]
    scopes: string[];
    principalType: string;
}

interface User {
    authenticated: boolean;
    accountId?: string | null;
    email?: string | null;
    roles: string[];
    scopes: string[];
    principalType?: string | null;
}

const normalizeRole = (role: string) => role.toLowerCase().replace(/^role_/, '');

const hasRole = (user: User | null, roleName: 'admin' | 'subscriber') =>
    Boolean(user?.roles.some((role) => normalizeRole(role) === roleName));

const hasBothPrimaryRoles = (user: User | null) => hasRole(user, 'admin') && hasRole(user, 'subscriber');

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAuthStatus();
    }, []);

    const checkAuthStatus = async () => {
        try {
            const response = await fetch(API_CONFIG.AUTH_ME_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                const authData: AuthMeResponse = await response.json();

                if (authData.authenticated) {
                    console.log('User authenticated:', authData);

                    setUser({
                        authenticated: true,
                        accountId: authData.accountId,
                        email: authData.email,
                        roles: authData.roles ?? [],
                        scopes: authData.scopes ?? [],
                        principalType: authData.principalType
                    });
                } else {
                    console.log('User not authenticated');
                    setUser(null);
                }
            } else {
                console.log('Auth check failed, status:', response.status);
                setUser(null);
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            const response = await fetch(API_CONFIG.LOGOUT_URL, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                setUser(null);
                window.location.href = '/login';
            } else {
                console.error('Logout failed');
                setUser(null);
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Error during logout:', error);
            setUser(null);
            window.location.href = '/login';
        }
    };

    const getRedirectPath = () => {
        if (!user) return '/login';
        if (hasBothPrimaryRoles(user)) return '/choose-role';
        if (hasRole(user, 'admin')) return '/admin';
        if (hasRole(user, 'subscriber')) return '/subscriber/cabinet';
        return '/login';
    };

    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner">Loading...</div>
            </div>
        );
    }

    return (
        <ToastProvider>
            <Router>
                <Routes>
                    <Route
                        path="/login"
                        element={
                            user ?
                                <Navigate to={getRedirectPath()} replace/> :
                                <Login onLoginSuccess={() => checkAuthStatus()}/>
                        }
                    />
                    <Route
                        path="/dashboard"
                        element={<Navigate to={getRedirectPath()} replace/>}
                    />
                    <Route
                        path="/choose-role"
                        element={
                            hasBothPrimaryRoles(user) ?
                                <RoleChooser userEmail={user?.email} onLogout={handleLogout}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }
                    />
                    <Route
                        path="/subscriber/cabinet"
                        element={
                            hasRole(user, 'subscriber') ?
                                <SubscriberCabinet
                                    userEmail={user?.email}
                                    canAccessAdmin={hasRole(user, 'admin')}
                                    onLogout={handleLogout}
                                /> :
                                <Navigate to={getRedirectPath()} replace/>
                        }
                    />
                    <Route
                        path="/admin"
                        element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }
                    >
                        <Route path="services" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="subscribers" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="memberships" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="charges" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="cost-calculations" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="ledger" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="invoices" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="actions" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="telegram-posts" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="profile" element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user?.email} userRoles={user?.roles}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                    </Route>
                    <Route
                        path="/"
                        element={<Navigate to={getRedirectPath()} replace/>}
                    />
                </Routes>
            </Router>
        </ToastProvider>
    );
}

export default App
