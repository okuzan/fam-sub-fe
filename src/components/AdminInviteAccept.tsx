import {useEffect, useRef, useState} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {API_CONFIG} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
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
    const [message, setMessage] = useState('Checking invite...');

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
                const response = await fetch(API_CONFIG.ADMIN_INVITES_ACCEPT_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    credentials: 'include',
                    body: JSON.stringify({token})
                });

                if (response.ok) {
                    sessionStorage.removeItem(STORAGE_KEY);
                    await onAuthRefresh();
                    setState('accepted');
                    setMessage('Admin access has been enabled.');
                    setTimeout(() => navigate('/admin', {replace: true}), 900);
                } else {
                    setState('failed');
                    setMessage(await getResponseErrorMessage(response, 'Failed to accept admin invite'));
                }
            } catch (err) {
                console.error(err);
                setState('failed');
                setMessage('Error accepting admin invite');
            }
        };

        acceptInvite();
    }, [isAuthenticated, navigate, onAuthRefresh, token]);

    const handleGoogleLogin = () => {
        if (tokenFromUrl) {
            sessionStorage.setItem(STORAGE_KEY, tokenFromUrl);
        }
        window.location.href = API_CONFIG.GOOGLE_OAUTH_URL;
    };

    const displayMessage = !token
        ? 'This admin invite link is missing its token.'
        : !isAuthenticated
            ? 'Sign in with the invited Google account to accept this admin invite.'
            : message;

    return (
        <main className="admin-invite-accept">
            <section className="admin-invite-accept-panel">
                <p className="admin-invite-accept-kicker">Admin invitation</p>
                <h1>{state === 'accepted' ? 'Invite accepted' : 'Accept admin access'}</h1>
                <p>{displayMessage}</p>

                {token && !isAuthenticated && (
                    <button type="button" onClick={handleGoogleLogin}>
                        Sign in with Google
                    </button>
                )}

                {state === 'failed' && (
                    <div className="admin-invite-accept-actions">
                        <button type="button" onClick={() => window.location.reload()}>
                            Try again
                        </button>
                        <Link to="/login">Go to login</Link>
                    </div>
                )}

                {state === 'accepted' && <Link to="/admin">Continue to admin</Link>}
            </section>
        </main>
    );
}
