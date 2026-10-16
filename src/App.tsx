import {BrowserRouter as Router, Navigate, Route, Routes} from 'react-router-dom';
import {useEffect, useState} from 'react';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import SubscriberCabinet from './components/SubscriberCabinet';
import RoleChooser from './components/RoleChooser';
import AdminInviteAccept from './components/AdminInviteAccept';
import PayPage from './pages/PayPage';
import {API_CONFIG, apiFetch} from './config/api';
import {ToastProvider} from './components/Toast';
import {ConfirmProvider} from './ui/ConfirmProvider';
import {Brand} from './ui/components';
import './App.css'
import './components/Login.css'
import './components/RoleChooser.css'
import './components/AdminInviteAccept.css'

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

const PENDING_ADMIN_INVITE_TOKEN_KEY = 'pendingAdminInviteToken';

const hasPendingAdminInviteToken = () =>
    typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem(PENDING_ADMIN_INVITE_TOKEN_KEY));

interface NoAccessProps {
    userEmail?: string | null;
    onRetry: () => void;
    onLogout: () => void;
}

function NoAccess({userEmail, onRetry, onLogout}: NoAccessProps) {
    return (
        <main className="auth-page">
            <Brand href="/"/>
            <section className="auth-card">
                <h1 className="auth-title">No workspace access</h1>
                <div className="auth-notice" role="alert">
                    <span className="auth-notice-title">
                        {userEmail ? `${userEmail} isn’t in FamSub` : 'This Google account isn’t in FamSub'}
                    </span>
                    <span className="auth-notice-text">
                        It signed in, but has no cabinet or admin access. Ask your FamSub admin to add this email.
                        If you just accepted an invite, check again.
                    </span>
                </div>
                <div className="auth-actions">
                    <button type="button" className="ui-btn" onClick={onRetry}>Check again</button>
                    <button type="button" className="ui-btn" onClick={onLogout}>Use another Google account</button>
                </div>
            </section>
        </main>
    );
}

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAuthStatus();
    }, []);

    const checkAuthStatus = async () => {
        try {
            const response = await apiFetch(API_CONFIG.AUTH_ME_URL);

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

    const clearClientState = () => {
        try {
            // Only the keys this app owns. Clearing the whole origin also wipes
            // anything else served from it.
            window.sessionStorage.removeItem(PENDING_ADMIN_INVITE_TOKEN_KEY);
        } catch (error) {
            console.error('Error clearing client state:', error);
        }
    };

    const redirectToLogin = () => {
        window.location.replace('/login');
    };

    const handleLogout = async () => {
        try {
            const response = await apiFetch(API_CONFIG.LOGOUT_URL, {
                method: 'POST',
            });

            if (!response.ok) {
                console.error('Logout failed');
            }
        } catch (error) {
            console.error('Error during logout:', error);
        } finally {
            setUser(null);
            clearClientState();
            redirectToLogin();
        }
    };

    const handleCurrentAccountDeleted = async () => {
        try {
            await apiFetch(API_CONFIG.LOGOUT_URL, {
                method: 'POST',
            });
        } catch (error) {
            console.error('Error clearing deleted account session:', error);
        } finally {
            setUser(null);
            clearClientState();
            redirectToLogin();
        }
    };

    const getRedirectPath = () => {
        if (!user) return '/login';
        if (hasPendingAdminInviteToken()) return '/admin-invites/accept';
        if (hasBothPrimaryRoles(user)) return '/choose-role';
        if (hasRole(user, 'admin')) return '/admin';
        if (hasRole(user, 'subscriber')) return '/subscriber/cabinet';
        return '/no-access';
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
            <ConfirmProvider>
            <Router>
                <Routes>
                    {/* Public: the link in every email. Paying needs no login. */}
                    <Route path="/pay/:payToken" element={<PayPage/>}/>
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
                        path="/no-access"
                        element={
                            user ?
                                <NoAccess userEmail={user.email} onRetry={checkAuthStatus} onLogout={handleLogout}/> :
                                <Navigate to="/login" replace/>
                        }
                    />
                    <Route
                        path="/admin-invites/accept"
                        element={
                            <AdminInviteAccept
                                isAuthenticated={Boolean(user?.authenticated)}
                                onAuthRefresh={checkAuthStatus}
                            />
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
                    {/*
                      * AdminDashboard renders no <Outlet/> - it switches on
                      * location.pathname itself - so a splat route is what
                      * actually drives the admin sections. Declaring them as
                      * nested <Route> children rendered nothing.
                      */}
                    <Route
                        path="/admin/*"
                        element={
                            hasRole(user, 'admin') ?
                                <AdminDashboard
                                    onLogout={handleLogout}
                                    onCurrentAccountDeleted={handleCurrentAccountDeleted}
                                    userEmail={user?.email}
                                    userRoles={user?.roles}
                                    currentAccountId={user?.accountId}
                                /> :
                                <Navigate to={getRedirectPath()} replace/>
                        }
                    />
                    <Route
                        path="/"
                        element={<Navigate to={getRedirectPath()} replace/>}
                    />
                </Routes>
            </Router>
            </ConfirmProvider>
        </ToastProvider>
    );
}

export default App
