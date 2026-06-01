import {Link} from 'react-router-dom';

interface RoleChooserProps {
    userEmail?: string | null;
    onLogout?: () => void;
}

export default function RoleChooser({userEmail, onLogout}: RoleChooserProps) {
    return (
        <main className="role-chooser">
            <section className="role-chooser-panel">
                <div>
                    <p className="role-chooser-kicker">{userEmail ?? 'Signed in'}</p>
                    <h1>Choose workspace</h1>
                </div>

                <div className="role-chooser-grid">
                    <Link to="/subscriber/cabinet" className="role-choice">
                        <span className="role-choice-icon" aria-hidden="true">◎</span>
                        <span>
                            <strong>Subscriber cabinet</strong>
                            <small>Review subscriptions, balances, and invoices.</small>
                        </span>
                    </Link>

                    <Link to="/admin" className="role-choice">
                        <span className="role-choice-icon" aria-hidden="true">▦</span>
                        <span>
                            <strong>Admin dashboard</strong>
                            <small>Manage services, subscribers, charges, and invoices.</small>
                        </span>
                    </Link>
                </div>

                <button type="button" className="role-chooser-logout" onClick={onLogout}>
                    Logout
                </button>
            </section>
        </main>
    );
}
