import {BrowserRouter as Router, Navigate, Route, Routes} from 'react-router-dom';
import {useEffect, useState} from 'react';
import Login from './components/Login';
import {API_CONFIG} from './config/api';
import './App.css'
import './components/Login.css'

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAuthStatus();
    }, []);

    const checkAuthStatus = async () => {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/auth/status`, {
                credentials: 'include'
            });

            if (response.ok) {
                setIsAuthenticated(true);
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            console.log('Not authenticated');
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
                setIsAuthenticated(false);
                window.location.href = '/login';
            } else {
                console.error('Logout failed');
                // Still clear local state even if backend call fails
                setIsAuthenticated(false);
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Error during logout:', error);
            // Clear local state on network errors too
            setIsAuthenticated(false);
            window.location.href = '/login';
        }
    };

    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner">Loading...</div>
            </div>
        );
    }

    return (
        <Router>
            <Routes>
                <Route
                    path="/login"
                    element={
                        isAuthenticated ?
                            <Navigate to="/dashboard" replace/> :
                            <Login onLoginSuccess={() => setIsAuthenticated(true)}/>
                    }
                />
                <Route
                    path="/dashboard"
                    element={
                        isAuthenticated ?
                            <div className="dashboard">
                                <h1>Welcome to FamSub Dashboard</h1>
                                <p>You are successfully logged in!</p>
                                <button onClick={handleLogout}>
                                    Logout
                                </button>
                            </div> :
                            <Navigate to="/login" replace/>
                    }
                />
                <Route
                    path="/"
                    element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace/>}
                />
            </Routes>
        </Router>
    );
}

export default App
