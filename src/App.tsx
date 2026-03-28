import {BrowserRouter as Router, Navigate, Route, Routes} from 'react-router-dom';
import {useEffect, useState} from 'react';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import {API_CONFIG} from './config/api';
import {ToastProvider} from './components/Toast';
import './App.css'
import './components/Login.css'
import './components/AdminDashboard.css'

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
    role?: 'user' | 'admin';
}

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
                    // Check for ADMIN role in the array (case-insensitive)
                    const userRole = authData.roles.some(role =>
                        role.toLowerCase() === 'admin'
                    ) ? 'admin' : 'user';

                    console.log('User authenticated:', authData);
                    console.log('User role:', userRole);

                    setUser({
                        authenticated: true,
                        accountId: authData.accountId,
                        email: authData.email,
                        role: userRole
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
        return user.role === 'admin' ? '/admin' : '/dashboard';
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
                        element={
                            user && user.role !== 'admin' ?
                                <div className="dashboard">
                                    <h1>Welcome to FamSub Dashboard</h1>
                                    <p>You are successfully logged in!</p>
                                    <button onClick={handleLogout}>
                                        Logout
                                    </button>
                                </div> :
                                <Navigate to={getRedirectPath()} replace/>
                        }
                    />
                    <Route
                        path="/admin"
                        element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }
                    >
                        <Route path="services" element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="subscribers" element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="memberships" element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="charges" element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="cost-calculations" element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="invoices" element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="telegram-posts" element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
                                <Navigate to={getRedirectPath()} replace/>
                        }/>
                        <Route path="profile" element={
                            user && user.role === 'admin' ?
                                <AdminDashboard onLogout={handleLogout} userEmail={user.email}/> :
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
