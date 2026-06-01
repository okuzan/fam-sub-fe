import {useCallback, useEffect, useState} from 'react';
import {API_CONFIG} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {useToast} from './ToastContext';
import type {AccountResponse} from '../types/account';
import type {AdminInviteResponse} from '../types/adminInvite';
import './AdminInvites.css';

const formatTimestamp = (dateTime: string | null) => {
    if (!dateTime) return '—';

    return new Date(dateTime).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getStatusClassName = (status: AdminInviteResponse['status']) =>
    `admin-invite-status admin-invite-status-${status.toLowerCase()}`;

export default function AdminInvites() {
    const {showError, showSuccess} = useToast();
    const [accounts, setAccounts] = useState<AccountResponse[]>([]);
    const [invites, setInvites] = useState<AdminInviteResponse[]>([]);
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const fetchAccounts = useCallback(async () => {
        const response = await fetch(API_CONFIG.ADMIN_ACCOUNTS_URL, {
            credentials: 'include'
        });

        if (response.ok) {
            setAccounts(await response.json());
        } else {
            showError(await getResponseErrorMessage(response, 'Failed to fetch accounts'));
        }
    }, [showError]);

    const fetchInvites = useCallback(async () => {
        try {
            await fetchAccounts();
            const response = await fetch(API_CONFIG.ADMIN_INVITES_URL, {
                credentials: 'include'
            });

            if (response.ok) {
                setInvites(await response.json());
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to fetch admin invites'));
            }
        } catch (err) {
            console.error(err);
            showError('Error fetching admin invites');
        } finally {
            setLoading(false);
        }
    }, [fetchAccounts, showError]);

    useEffect(() => {
        fetchInvites();
    }, [fetchInvites]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            showError('Email is required');
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(API_CONFIG.ADMIN_INVITES_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify({email: trimmedEmail})
            });

            if (response.ok) {
                setEmail('');
                showSuccess(`Admin invite sent to ${trimmedEmail}`);
                await fetchInvites();
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to send admin invite'));
            }
        } catch (err) {
            console.error(err);
            showError('Error sending admin invite');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteAccount = async (account: AccountResponse) => {
        if (!account.canDelete) return;
        if (!confirm(`Delete account ${account.email}? This removes its login access.`)) return;

        setDeletingAccountId(account.id);
        try {
            const response = await fetch(`${API_CONFIG.ADMIN_ACCOUNTS_URL}/${account.id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                showSuccess(`Deleted account ${account.email}`);
                await fetchAccounts();
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to delete account'));
            }
        } catch (err) {
            console.error(err);
            showError('Error deleting account');
        } finally {
            setDeletingAccountId(null);
        }
    };

    const handleRevoke = async (invite: AdminInviteResponse) => {
        if (!confirm(`Revoke admin invite for ${invite.email}?`)) return;

        setRevokingId(invite.id);
        try {
            const response = await fetch(`${API_CONFIG.ADMIN_INVITES_URL}/${invite.id}/revoke`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                showSuccess(`Revoked invite for ${invite.email}`);
                await fetchInvites();
            } else {
                showError(await getResponseErrorMessage(response, 'Failed to revoke admin invite'));
            }
        } catch (err) {
            console.error(err);
            showError('Error revoking admin invite');
        } finally {
            setRevokingId(null);
        }
    };

    return (
        <div className="admin-invites">
            <div className="admin-invites-header">
                <div>
                    <h2>Admin Access</h2>
                    <p>Manage administrator accounts and one-time Google-based invitations.</p>
                </div>
            </div>

            <section className="admin-access-section">
                <h3>Accounts</h3>
                {loading ? (
                    <div className="admin-invites-loading">Loading accounts...</div>
                ) : (
                    <div className="admin-invites-table-wrap">
                        <table className="admin-invites-table">
                            <thead>
                            <tr>
                                <th>Email</th>
                                <th>Roles</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            {accounts.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="admin-invites-empty">No accounts found.</td>
                                </tr>
                            ) : (
                                accounts.map((account) => (
                                    <tr key={account.id}>
                                        <td>{account.email}</td>
                                        <td>{account.roles.join(', ') || '—'}</td>
                                        <td>{formatTimestamp(account.createdAt)}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="admin-account-delete-btn"
                                                onClick={() => handleDeleteAccount(account)}
                                                disabled={!account.canDelete || deletingAccountId === account.id}
                                                title={!account.canDelete ? 'The only admin account cannot be deleted' : undefined}
                                            >
                                                {deletingAccountId === account.id ? 'Deleting...' : 'Delete'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="admin-access-section">
                <h3>Invites</h3>

                <form className="admin-invite-form" onSubmit={handleSubmit}>
                    <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="admin@gmail.com"
                        disabled={submitting}
                    />
                    <button type="submit" disabled={submitting}>
                        {submitting ? 'Sending...' : 'Send invite'}
                    </button>
                </form>

                {loading ? (
                    <div className="admin-invites-loading">Loading invites...</div>
                ) : (
                    <div className="admin-invites-table-wrap">
                        <table className="admin-invites-table">
                            <thead>
                            <tr>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Expires</th>
                                <th>Accepted</th>
                                <th>Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            {invites.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="admin-invites-empty">No admin invites yet.</td>
                                </tr>
                            ) : (
                                invites.map((invite) => (
                                    <tr key={invite.id}>
                                        <td>{invite.email}</td>
                                        <td><span className={getStatusClassName(invite.status)}>{invite.status}</span>
                                        </td>
                                        <td>{formatTimestamp(invite.createdAt)}</td>
                                        <td>{formatTimestamp(invite.expiresAt)}</td>
                                        <td>{formatTimestamp(invite.acceptedAt)}</td>
                                        <td>
                                            {invite.status === 'PENDING' ? (
                                                <button
                                                    type="button"
                                                    className="admin-invite-revoke-btn"
                                                    onClick={() => handleRevoke(invite)}
                                                    disabled={revokingId === invite.id}
                                                >
                                                    {revokingId === invite.id ? 'Revoking...' : 'Revoke'}
                                                </button>
                                            ) : (
                                                <span className="admin-invite-no-action">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
