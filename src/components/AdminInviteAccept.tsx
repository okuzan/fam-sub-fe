import {useEffect, useRef, useState} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {API_CONFIG, apiFetch} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {Brand} from '../ui/components';
import {GoogleMark} from './Login';
import './AdminInviteAccept.css';

interface AdminInviteAcceptProps {
    isAuthenticated: boolean;
    onAuthRefresh: () => Promise<void> | void;
}

type AcceptState = 'accepting' | 'accepted' | 'failed';

const STORAGE_KEY = 'pendingAdminInviteToken';

export default function AdminInviteAccept({isAuthenticated, onAuthRefresh}: AdminInviteAcceptProps) {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const tokenFromUrl = searchParams.get('token')?.trim() ?? '';
    const token = tokenFromUrl || sessionStorage.getItem(STORAGE_KEY) || '';
    const acceptedTokenRef = useRef<string | null>(null);
    const [state, setState] = useState<AcceptState>('accepting');
    const [message, setMessage] = useState('Checking your invite…');

    useEffect(() => {
        if (tokenFromUrl) {
            sessionStorage.setItem(STORAGE_KEY, tokenFromUrl);
        }
    }, [tokenFromUrl]);

    useEffect(() => {
        if (!token || !isAuthenticated) {
            return;
        }

        const acceptInvite = async () => {
            if (acceptedTokenRef.current === token) {
                return;
            }
            acceptedTokenRef.current = token;
            setState('accepting');
            try {
                const response = await apiFetch(API_CONFIG.ADMIN_INVITES_ACCEPT_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({token})
                });

                if (response.ok) {
                    sessionStorage.removeItem(STORAGE_KEY);
                    await onAuthRefresh();
                    setState('accepted');
                    setMessage('You now have the admin panel. Taking you there…');
                    setTimeout(() => navigate('/admin', {replace: true}), 900);
                } else {
                    setState('failed');
                    setMessage(await getResponseErrorMessage(response, 'This invite could not be accepted.'));
                }
            } catch (err) {
                console.error(err);
                setState('failed');
                setMessage('Something went wrong accepting the invite.');
            }
        };

        void acceptInvite();
    }, [isAuthenticated, navigate, onAuthRefresh, token]);

    const handleGoogleLogin = () => {
        if (tokenFromUrl) {
            sessionStorage.setItem(STORAGE_KEY, tokenFromUrl);
        }
        window.location.href = API_CONFIG.GOOGLE_OAUTH_URL;
    };

    const title = state === 'accepted' ? 'Invite accepted' : 'Accept admin access';

    return (
        <main className="auth-page">
            <Brand href="/"/>
            <section className="auth-card invite-card">
                <span className="auth-eyebrow">Admin invitation</span>
                <h1 className="auth-title">{title}</h1>

                {!token ? (
                    <div className="auth-notice" role="alert">
                        <span className="auth-notice-title">This invite link is incomplete</span>
                        <span className="auth-notice-text">Open the link from your invite email again, in full.</span>
                    </div>
                ) : !isAuthenticated ? (
                    <>
                        <p className="auth-text">
                            Sign in with the Google account the invite was sent to. Access is granted right after.
                        </p>
                        <button type="button" className="auth-google-btn" onClick={handleGoogleLogin}>
                            <GoogleMark/>
                            Sign in with Google
                        </button>
                    </>
                ) : state === 'failed' ? (
                    <>
                        <div className="auth-notice" role="alert">
                            <span className="auth-notice-title">{message}</span>
                            <span className="auth-notice-text">
                                Invites last 7 days and work only for the invited email. Ask for a new one if needed.
                            </span>
                        </div>
                        <div className="auth-actions">
                            <button type="button" className="ui-btn" onClick={() => window.location.reload()}>
                                Try again
                            </button>
                            <Link to="/login" className="ui-btn">Go to sign in</Link>
                        </div>
                    </>
                ) : state === 'accepted' ? (
                    <>
                        <div className="auth-notice tone-green" role="status">
                            <span className="auth-notice-text">{message}</span>
                        </div>
                        <Link to="/admin" className="ui-btn is-primary is-block">Continue to admin</Link>
                    </>
                ) : (
                    <p className="auth-text invite-pending" role="status">{message}</p>
                )}
            </section>
        </main>
    );
}
