import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {API_CONFIG, apiFetch} from '../config/api';
import {Brand} from '../ui/components';
import {formatMoney} from '../ui/format';
import type {SubscriberCabinetResponse} from '../types/cabinet';
import './RoleChooser.css';

interface RoleChooserProps {
    userEmail?: string | null;
    onLogout?: () => void;
}

export default function RoleChooser({userEmail, onLogout}: RoleChooserProps) {
    // Someone with both roles is a subscriber too, so their cabinet knows their
    // name and what they owe. Without it the email stands in.
    const [cabinet, setCabinet] = useState<SubscriberCabinetResponse | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const response = await apiFetch(API_CONFIG.SUBSCRIBER_CABINET_URL);
                if (response.ok) setCabinet(await response.json());
            } catch (err) {
                console.error(err);
            }
        };
        void load();
    }, []);

    const who = cabinet?.subscriber.name ?? userEmail ?? 'You';
    const owed = Number(cabinet?.totalAmountOwed ?? 0);
    const cabinetNote = cabinet
        ? owed > 0 ? `Your own subscriptions and invoices · you owe ${formatMoney(owed)}`
            : 'Your own subscriptions and invoices · nothing owed'
        : 'Your own subscriptions and invoices';

    return (
        <main className="auth-page role-page">
            <Brand href="/choose-role"/>
            <div className="role-body">
                <h1 className="role-title">{who}, where to?</h1>

                <Link to="/admin" className="role-option">
                    <span className="role-option-text">
                        <span className="role-option-title">Admin panel</span>
                        <span className="role-option-note">Bank payments, invoices, costs and people</span>
                    </span>
                    <span className="role-option-arrow" aria-hidden="true">→</span>
                </Link>

                <Link to="/subscriber/cabinet" className="role-option">
                    <span className="role-option-text">
                        <span className="role-option-title">My cabinet</span>
                        <span className="role-option-note">{cabinetNote}</span>
                    </span>
                    <span className="role-option-arrow" aria-hidden="true">→</span>
                </Link>

                <span className="role-caption">Switch any time from the sidebar or the cabinet header.</span>

                <button type="button" className="ui-link-btn is-muted role-logout" onClick={onLogout}>
                    Log out
                </button>
            </div>
        </main>
    );
}
