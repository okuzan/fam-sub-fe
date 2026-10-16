import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {API_CONFIG} from '../config/api';
import {Brand} from '../ui/components';
import './Login.css';

interface LoginProps {
    onLoginSuccess?: () => void;
}

export function GoogleMark() {
    return (
        <svg className="auth-google-mark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
    );
}

export default function Login({onLoginSuccess}: LoginProps) {
    const [searchParams] = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    // The OAuth failure redirect is /login?error=true; it does not say which
    // account was refused, so the email is shown only when one is passed.
    const rejected = searchParams.has('error');
    const rejectedEmail = searchParams.get('email')?.trim() || null;

    const handleGoogleLogin = () => {
        setIsLoading(true);
        setStartError(null);
        try {
            // Spring Security handles the OAuth dance and redirects back.
            window.location.href = API_CONFIG.GOOGLE_OAUTH_URL;
            onLoginSuccess?.();
        } catch {
            setStartError('Could not start Google sign-in. Try again.');
            setIsLoading(false);
        }
    };

    return (
        <main className="auth-page">
            <Brand href="/login"/>
            <section className="auth-card">
                <h1 className="auth-title">Sign in</h1>

                {rejected && (
                    <div className="auth-notice" role="alert">
                        <span className="auth-notice-title">
                            {rejectedEmail ? `${rejectedEmail} isn’t in FamSub` : 'That Google account isn’t in FamSub'}
                        </span>
                        <span className="auth-notice-text">
                            Try a different Google account, or ask your FamSub admin to add this email.
                        </span>
                    </div>
                )}

                {startError && (
                    <div className="auth-notice" role="alert">
                        <span className="auth-notice-text">{startError}</span>
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="auth-google-btn"
                >
                    {isLoading ? 'Redirecting…' : (
                        <>
                            <GoogleMark/>
                            {rejected ? 'Use another Google account' : 'Sign in with Google'}
                        </>
                    )}
                </button>

                {!rejected && (
                    <p className="auth-small">
                        Only people already in FamSub can sign in. Use the Google account your admin added for you.
                    </p>
                )}
            </section>
        </main>
    );
}
