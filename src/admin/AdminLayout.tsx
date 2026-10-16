import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {API_CONFIG, apiFetch} from '../config/api';
import {currentMonth} from '../ui/format';
import {useEscapeClose} from '../utils/useEscapeClose';
import type {BankPaymentsOverview, BankSyncStatus} from '../types/bankPayment';
import type {FinanceSummary} from '../types/finance';
import type {SubscriptionServiceResponse} from '../types/subscription';
import {getAllMemberships, isActiveIn} from './screens/people';
import {AdminNavContext, type NavCounts} from './adminNavContext';
import '../ui/ui.css';
import './AdminLayout.css';

interface NavItem {
    name: string;
    path: string;
    badge?: (counts: NavCounts) => number | undefined;
    count?: (counts: NavCounts) => number | undefined;
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
    {
        label: '',
        items: [
            {name: 'Overview', path: '/admin', badge: (c) => c.overview},
            {name: 'Finance', path: '/admin/finance'},
        ],
    },
    {
        label: 'Billing',
        items: [
            {name: 'Bank payments', path: '/admin/bank-payments', badge: (c) => c.bankReview},
            {name: 'Invoices', path: '/admin/invoices', count: (c) => c.unpaidInvoices},
            {name: 'Ledger', path: '/admin/ledger'},
            {name: 'Charges', path: '/admin/charges'},
        ],
    },
    {
        label: 'People',
        items: [
            {name: 'Subscribers', path: '/admin/subscribers', count: (c) => c.subscribers},
            {name: 'Memberships', path: '/admin/memberships', count: (c) => c.activeMemberships},
            {name: 'Services', path: '/admin/services', count: (c) => c.services},
        ],
    },
    {
        label: 'System',
        items: [
            {name: 'Admin access', path: '/admin/invites'},
            {name: 'Activity log', path: '/admin/actions'},
        ],
    },
];

const isActive = (item: NavItem, pathname: string) =>
    item.path === '/admin' ? pathname === '/admin' || pathname === '/admin/' : pathname.startsWith(item.path);

const fetchJson = async <T, >(url: string): Promise<T | null> => {
    try {
        const response = await apiFetch(url);
        return response.ok ? await response.json() as T : null;
    } catch {
        return null;
    }
};

interface LoadedCounts {
    counts: NavCounts;
    bankSync: BankSyncStatus | null;
}

const loadCounts = async (): Promise<LoadedCounts> => {
    const [bank, finance, subscribers, services] = await Promise.all([
        fetchJson<BankPaymentsOverview>(`${API_CONFIG.ADMIN_BANK_PAYMENTS_URL}?status=UNMATCHED&limit=500`),
        fetchJson<FinanceSummary>(API_CONFIG.ADMIN_FINANCE_SUMMARY_URL),
        fetchJson<unknown[]>(API_CONFIG.SUBSCRIBERS_URL),
        fetchJson<SubscriptionServiceResponse[]>(API_CONFIG.SUBSCRIPTION_SERVICES_URL),
    ]);
    // There is no list-all endpoint for memberships; they are read per service.
    const memberships = services ? await getAllMemberships(services).catch(() => null) : null;
    const month = currentMonth();
    return {
        counts: {
            bankReview: bank?.transactions.length,
            unpaidInvoices: finance?.unpaidInvoiceCount,
            subscribers: subscribers?.length,
            activeMemberships: memberships?.filter((m) => isActiveIn(m, month)).length,
            services: services?.length,
        },
        bankSync: bank?.sync ?? null,
    };
};

interface AdminLayoutProps {
    children: ReactNode;
    userEmail?: string | null;
    canAccessCabinet: boolean;
    onLogout: () => void;
}

export default function AdminLayout({children, userEmail, canAccessCabinet, onLogout}: AdminLayoutProps) {
    const location = useLocation();
    const [counts, setCounts] = useState<NavCounts>({});
    const [bankSync, setBankSync] = useState<BankSyncStatus | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const applyCounts = useCallback(({counts: next, bankSync: sync}: LoadedCounts) => {
        setCounts((previous) => ({...previous, ...next}));
        if (sync) setBankSync(sync);
    }, []);

    const refreshCounts = useCallback(() => {
        void loadCounts().then(applyCounts);
    }, [applyCounts]);

    useEffect(() => {
        let cancelled = false;
        void loadCounts().then((loaded) => {
            if (!cancelled) applyCounts(loaded);
        });
        return () => {
            cancelled = true;
        };
    }, [applyCounts]);

    useEscapeClose(menuOpen, () => setMenuOpen(false));

    const setOverviewCount = useCallback((overview: number) => {
        setCounts((previous) => previous.overview === overview ? previous : {...previous, overview});
    }, []);

    const current = useMemo(
        () => NAV_GROUPS.flatMap((group) => group.items).find((item) => isActive(item, location.pathname)),
        [location.pathname]
    );

    const nav = useMemo(() => ({
        counts,
        bankSync,
        refreshCounts,
        setOverviewCount,
        userEmail,
        canAccessCabinet,
        onLogout,
    }), [counts, bankSync, refreshCounts, setOverviewCount, userEmail, canAccessCabinet, onLogout]);

    const renderNav = (variant: 'sidebar' | 'sheet') => (
        <nav className={`admin-nav admin-nav-${variant}`} aria-label="Admin sections">
            {NAV_GROUPS.map((group) => (
                <div key={group.label || 'main'} className="admin-nav-group">
                    {group.label && <div className="admin-nav-label">{group.label}</div>}
                    {group.items.map((item) => {
                        const active = isActive(item, location.pathname);
                        const badge = item.badge?.(counts);
                        const count = item.count?.(counts);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`admin-nav-item ${active ? 'is-active' : ''}`}
                                aria-current={active ? 'page' : undefined}
                                onClick={() => setMenuOpen(false)}
                            >
                                {item.name}
                                {badge ? <span className="ui-count-badge admin-nav-meta">{badge}</span>
                                    : count !== undefined && <span className="admin-nav-count admin-nav-meta">{count}</span>}
                            </Link>
                        );
                    })}
                </div>
            ))}
        </nav>
    );

    const account = (
        <div className="admin-account">
            <span className="admin-account-email">{userEmail ?? 'Signed in'}</span>
            <div className="admin-account-actions">
                {canAccessCabinet && <Link to="/subscriber/cabinet" className="ui-btn is-small admin-account-cabinet">My cabinet</Link>}
                <button type="button" className="ui-btn is-small" onClick={onLogout}>Log out</button>
            </div>
        </div>
    );

    return (
        <AdminNavContext.Provider value={nav}>
            <div className="admin-shell">
                <aside className="admin-sidebar">
                    <div className="admin-sidebar-brand">
                        <Link to="/admin" className="ui-brand">
                            <img src="/favicon.svg" alt="" width={18} height={18}/>
                            FamSub
                        </Link>
                        <span className="admin-role-chip">Admin</span>
                    </div>
                    {renderNav('sidebar')}
                    {account}
                </aside>

                <header className="admin-topbar">
                    <img src="/favicon.svg" alt="" width={16} height={16}/>
                    <span className="admin-topbar-title">{menuOpen ? 'FamSub' : current?.name ?? 'FamSub'}</span>
                    <button
                        type="button"
                        className={`admin-menu-btn ${menuOpen ? 'is-open' : ''}`}
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-expanded={menuOpen}
                    >
                        {menuOpen ? 'Close' : 'Menu'}
                        {!menuOpen && counts.overview ? <span className="ui-count-badge">{counts.overview}</span> : null}
                    </button>
                </header>

                {menuOpen && (
                    <div className="admin-sheet">
                        {renderNav('sheet')}
                        {account}
                    </div>
                )}

                <main className="admin-main">{children}</main>
            </div>
        </AdminNavContext.Provider>
    );
}
