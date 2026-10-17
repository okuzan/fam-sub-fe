import {Navigate, useLocation} from 'react-router-dom';
import AdminLayout from '../admin/AdminLayout';
import Overview from '../admin/screens/Overview';
import Finance from '../admin/screens/Finance';
import BankPayments from '../admin/screens/BankPayments';
import CardCharges from '../admin/screens/CardCharges';
import Invoices from '../admin/screens/Invoices';
import Ledger from '../admin/screens/Ledger';
import Charges from '../admin/screens/Charges';
import Subscribers from '../admin/screens/Subscribers';
import Memberships from '../admin/screens/Memberships';
import Services from '../admin/screens/Services';
import AdminAccess from '../admin/screens/AdminAccess';
import ActivityLog from '../admin/screens/ActivityLog';

interface AdminDashboardProps {
    onLogout: () => void;
    onCurrentAccountDeleted?: () => void;
    userEmail?: string | null;
    userRoles?: string[];
    currentAccountId?: string | null;
}

/*
 * The admin panel. App mounts this on /admin/*, and the section is picked from
 * the path here rather than with nested <Route>s: AdminLayout renders the
 * sidebar around whichever screen matches.
 */
export default function AdminDashboard({
    onLogout,
    onCurrentAccountDeleted,
    userEmail,
    userRoles = [],
    currentAccountId
}: AdminDashboardProps) {
    const {pathname} = useLocation();
    const canAccessCabinet = userRoles.some((role) => role.replace(/^ROLE_/i, '').toLowerCase() === 'subscriber');
    const path = pathname.replace(/\/+$/, '') || '/admin';

    const screen = (() => {
        switch (path) {
            case '/admin':
                return <Overview/>;
            case '/admin/finance':
                return <Finance/>;
            case '/admin/bank-payments':
                return <BankPayments/>;
            case '/admin/card-charges':
                return <CardCharges/>;
            case '/admin/invoices':
                return <Invoices/>;
            case '/admin/ledger':
            case '/admin/cost-calculations':
                return <Ledger/>;
            case '/admin/charges':
                return <Charges/>;
            case '/admin/subscribers':
                return <Subscribers/>;
            case '/admin/memberships':
                return <Memberships/>;
            case '/admin/services':
                return <Services/>;
            case '/admin/invites':
                return <AdminAccess currentAccountId={currentAccountId} onCurrentAccountDeleted={onCurrentAccountDeleted}/>;
            case '/admin/actions':
                return <ActivityLog/>;
            default:
                return <Navigate to="/admin" replace/>;
        }
    })();

    return (
        <AdminLayout userEmail={userEmail} canAccessCabinet={canAccessCabinet} onLogout={onLogout}>
            {screen}
        </AdminLayout>
    );
}
