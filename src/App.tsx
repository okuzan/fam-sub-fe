import {BrowserRouter as Router, Navigate, Route, Routes} from 'react-router-dom';
import {useEffect, useState} from 'react';
import Login from './components/Login';
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
            const response = await fetch(`${import.meta.env.PROD ? 'https://api.famsub.almonium.com/v1' : 'http://localhost:8888/v1'}/auth/status`, {
                credentials: 'include'
            });

            if (response.ok) {
                setIsAuthenticated(true);
            }
        } catch (error) {
            console.log('Not authenticated');
        } finally {
            setIsLoading(false);
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
                                <button onClick={() => {
                                    setIsAuthenticated(false);
                                    window.location.href = '/login';
                                }}>
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
