import {type FormEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../config/api';
import {getResponseErrorMessage} from '../../utils/errors';
import {useToast} from '../../components/ToastContext';
import {useConfirm} from '../../ui/confirmContext';
import {EmptyState, PageHeader, Segmented, TableSkeleton, Tag, type Tone} from '../../ui/components';
import {formatInstantDate} from '../../ui/format';
import type {AccountResponse} from '../../types/account';
import type {AdminInviteResponse} from '../../types/adminInvite';
import type {SubscriberResponse} from '../../types/subscriber';
import './AdminAccess.css';

interface AdminAccessProps {
    currentAccountId?: string | null;
    onCurrentAccountDeleted?: () => void;
}

type AccountFilter = 'all' | 'admins' | 'subscribers';

/** The backend only stores PENDING; a pending invite past its expiry is shown as expired. */
type InviteDisplayStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

const INVITE_TONE: Record<InviteDisplayStatus, Tone> = {
    PENDING: 'slate',
    ACCEPTED: 'green',
    REVOKED: 'grey',
    EXPIRED: 'grey',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inviteStatus = (invite: AdminInviteResponse): InviteDisplayStatus =>
    invite.status === 'PENDING' && new Date(invite.expiresAt).getTime() < Date.now() ? 'EXPIRED' : invite.status;

/** "Sent 1 Mar 2026 · accepted 2 Mar 2026". */
const inviteDates = (invite: AdminInviteResponse, status: InviteDisplayStatus) => {
    const sent = `Sent ${formatInstantDate(invite.createdAt)}`;
    if (status === 'ACCEPTED') return `${sent} · accepted ${formatInstantDate(invite.acceptedAt)}`;
    if (status === 'REVOKED') return `${sent} · revoked ${formatInstantDate(invite.revokedAt ?? invite.updatedAt)}`;
    if (status === 'EXPIRED') return `${sent} · expired ${formatInstantDate(invite.expiresAt)}`;
    return `${sent} · expires ${formatInstantDate(invite.expiresAt)}`;
};

const ROLE_ORDER = ['ADMIN', 'SUBSCRIBER'];

export default function AdminAccess({currentAccountId, onCurrentAccountDeleted}: AdminAccessProps) {
    const {showError, showSuccess} = useToast();
    const confirm = useConfirm();
    const [accounts, setAccounts] = useState<AccountResponse[]>([]);
    const [invites, setInvites] = useState<AdminInviteResponse[]>([]);
    const [namesByEmail, setNamesByEmail] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<AccountFilter>('all');
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const fetchAccounts = useCallback(async () => {
        const response = await apiFetch(API_CONFIG.ADMIN_ACCOUNTS_URL);
        if (response.ok) {
            setAccounts(await response.json());
        } else {
            showError(await getResponseErrorMessage(response, 'Could not load accounts'));
        }
    }, [showError]);

    const fetchInvites = useCallback(async () => {
        const response = await apiFetch(API_CONFIG.ADMIN_INVITES_URL);
        if (response.ok) {
            setInvites(await response.json());
        } else {
            showError(await getResponseErrorMessage(response, 'Could not load admin invites'));
        }
    }, [showError]);

    // Accounts carry no name; a subscriber with the same email lends theirs.
    const fetchNames = useCallback(async () => {
        const response = await apiFetch(API_CONFIG.SUBSCRIBERS_URL);
        if (!response.ok) return;
        const subscribers: SubscriberResponse[] = await response.json();
        setNamesByEmail(Object.fromEntries(subscribers.map((s) => [s.email.toLowerCase(), s.name])));
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                await Promise.all([fetchAccounts(), fetchInvites(), fetchNames()]);
            } catch (err) {
                console.error(err);
                showError('Could not load admin access');
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [fetchAccounts, fetchInvites, fetchNames, showError]);

    const counts = useMemo(() => ({
        all: accounts.length,
        admins: accounts.filter((a) => a.roles.includes('ADMIN')).length,
        subscribers: accounts.filter((a) => a.roles.includes('SUBSCRIBER')).length,
    }), [accounts]);

    const visibleAccounts = useMemo(() => {
        const list = accounts.filter((account) => {
            if (filter === 'admins') return account.roles.includes('ADMIN');
            if (filter === 'subscribers') return account.roles.includes('SUBSCRIBER');
            return true;
        });
        // You first, then admins, then by email.
        return list.sort((a, b) =>
            Number(b.id === currentAccountId) - Number(a.id === currentAccountId)
            || Number(b.roles.includes('ADMIN')) - Number(a.roles.includes('ADMIN'))
            || a.email.localeCompare(b.email));
    }, [accounts, filter, currentAccountId]);

    const nameFor = (account: AccountResponse) =>
        namesByEmail[account.email.toLowerCase()] ?? account.email.split('@')[0];

    const handleDeleteAccount = async (account: AccountResponse) => {
        if (!account.canDelete) return;
        const isSelf = account.id === currentAccountId;
        const {confirmed} = await confirm({
            title: isSelf ? 'Delete your own account?' : `Delete ${account.email}?`,
            text: isSelf
                ? 'You will be signed out right away and lose access to this panel.'
                : 'They will no longer be able to sign in. Their subscriber record and invoices stay.',
            confirmLabel: 'Delete account',
            tone: 'danger',
        });
        if (!confirmed) return;

        setBusyId(account.id);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_ACCOUNTS_URL}/${account.id}`, {method: 'DELETE'});
            if (!response.ok) {
                showError(await getResponseErrorMessage(response, 'Could not delete account'));
                return;
            }
            if (isSelf) {
                onCurrentAccountDeleted?.();
                return;
            }
            showSuccess('Account deleted', account.email);
            await fetchAccounts();
        } catch (err) {
            console.error(err);
            showError('Could not delete account');
        } finally {
            setBusyId(null);
        }
    };

    const handleInvite = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = email.trim();
        if (!trimmed) {
            setEmailError('Enter the Google email to invite');
            return;
        }
        if (!EMAIL_PATTERN.test(trimmed)) {
            setEmailError('This doesn’t look like an email address');
            return;
        }
        setEmailError(null);
        setSubmitting(true);
        try {
            const response = await apiFetch(API_CONFIG.ADMIN_INVITES_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email: trimmed}),
            });
            if (!response.ok) {
                showError(await getResponseErrorMessage(response, 'Could not send the invite'));
                return;
            }
            setEmail('');
            showSuccess('Invite sent', trimmed);
            await Promise.all([fetchInvites(), fetchAccounts()]);
        } catch (err) {
            console.error(err);
            showError('Could not send the invite');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevoke = async (invite: AdminInviteResponse) => {
        const {confirmed} = await confirm({
            title: `Revoke the invite for ${invite.email}?`,
            text: 'The link in their email stops working. You can invite them again later.',
            confirmLabel: 'Revoke invite',
            tone: 'danger',
        });
        if (!confirmed) return;

        setBusyId(invite.id);
        try {
            const response = await apiFetch(`${API_CONFIG.ADMIN_INVITES_URL}/${invite.id}/revoke`, {method: 'POST'});
            if (!response.ok) {
                showError(await getResponseErrorMessage(response, 'Could not revoke the invite'));
                return;
            }
            showSuccess('Invite revoked', invite.email);
            await fetchInvites();
        } catch (err) {
            console.error(err);
            showError('Could not revoke the invite');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="acc">
            <PageHeader
                eyebrow="System"
                title="Admin access"
                lead="Everyone who can sign in. Subscribers get a cabinet; admins also get this panel."
            />

            <div className="acc-filters">
                <Segmented<AccountFilter>
                    ariaLabel="Filter accounts"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        {value: 'all', label: 'Everyone', count: counts.all},
                        {value: 'admins', label: 'Admins', count: counts.admins},
                        {value: 'subscribers', label: 'Subscribers', count: counts.subscribers},
                    ]}
                />
            </div>

            <section className="acc-section">
                {loading ? (
                    <TableSkeleton columns="0.8fr 1.2fr 220px 120px" rows={5}/>
                ) : visibleAccounts.length === 0 ? (
                    <EmptyState title="No accounts here">
                        Accounts appear once someone signs in with Google.
                    </EmptyState>
                ) : (
                    <>
                        <div className="ui-table-wrap">
                            <table className="ui-table acc-table">
                                <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Google email</th>
                                    <th>Roles</th>
                                    <th aria-label="Actions"/>
                                </tr>
                                </thead>
                                <tbody>
                                {visibleAccounts.map((account) => {
                                    const isSelf = account.id === currentAccountId;
                                    const roles = [...account.roles].sort(
                                        (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
                                    return (
                                        <tr key={account.id}>
                                            <td className="acc-name">{nameFor(account)}</td>
                                            <td className="acc-email">{account.email}</td>
                                            <td>
                                                <span className="acc-roles">
                                                    {roles.length === 0
                                                        ? <span className="ui-faint">No role</span>
                                                        : roles.map((role) => (
                                                            <Tag key={role} tone={role === 'ADMIN' ? 'dark' : 'grey'}>{role}</Tag>
                                                        ))}
                                                </span>
                                            </td>
                                            <td className="is-actions">
                                                {isSelf && <span className="acc-you">You</span>}
                                                {(!isSelf || account.canDelete) && (
                                                    <button
                                                        type="button"
                                                        className="ui-link-btn is-danger"
                                                        onClick={() => handleDeleteAccount(account)}
                                                        disabled={!account.canDelete || busyId === account.id}
                                                        title={account.canDelete ? undefined : 'The only admin account cannot be deleted'}
                                                    >
                                                        {busyId === account.id ? 'Deleting…' : 'Delete'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                        <div className="ui-table-footer">
                            <span>Showing {visibleAccounts.length} of {accounts.length} accounts</span>
                        </div>
                    </>
                )}
            </section>

            <section className="acc-section acc-invites">
                <div className="acc-invites-head">
                    <h2 className="ui-section-title">Admin invites</h2>
                    <span className="acc-invites-note">The invitee signs in with Google using this email</span>
                </div>

                <form className="acc-invite-form" onSubmit={handleInvite} noValidate>
                    <div className="acc-invite-field">
                        <input
                            type="email"
                            className={`ui-input ${emailError ? 'acc-input-error' : ''}`}
                            value={email}
                            onChange={(event) => {
                                setEmail(event.target.value);
                                if (emailError) setEmailError(null);
                            }}
                            placeholder="name@gmail.com"
                            aria-label="Email to invite as admin"
                            aria-invalid={Boolean(emailError)}
                            disabled={submitting}
                        />
                        {emailError && <span className="ui-field-error">{emailError}</span>}
                    </div>
                    <button type="submit" className="ui-btn is-primary" disabled={submitting}>
                        {submitting ? 'Sending…' : 'Invite admin'}
                    </button>
                </form>

                {loading ? (
                    <TableSkeleton columns="1.2fr 110px 1fr 100px" rows={3}/>
                ) : invites.length === 0 ? (
                    <EmptyState title="No invites yet">
                        Invite someone above to give them this panel.
                    </EmptyState>
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table acc-table">
                            <thead>
                            <tr>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Dates</th>
                                <th aria-label="Actions"/>
                            </tr>
                            </thead>
                            <tbody>
                            {invites.map((invite) => {
                                const status = inviteStatus(invite);
                                return (
                                    <tr key={invite.id}>
                                        <td className="acc-email is-ink">{invite.email}</td>
                                        <td><Tag tone={INVITE_TONE[status]}>{status}</Tag></td>
                                        <td className="ui-muted">{inviteDates(invite, status)}</td>
                                        <td className="is-actions">
                                            {invite.status === 'PENDING' && (
                                                <button
                                                    type="button"
                                                    className="ui-link-btn is-danger"
                                                    onClick={() => handleRevoke(invite)}
                                                    disabled={busyId === invite.id}
                                                >
                                                    {busyId === invite.id ? 'Revoking…' : 'Revoke'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
