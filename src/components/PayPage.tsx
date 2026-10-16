import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import QRCode from 'qrcode';
import {API_CONFIG, apiFetch} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import type {PayPageResponse} from '../types/bankPayment';
import './PayPage.css';

/*
 * Banking apps that claim https://bank.gov.ua/qr/ links, from NBU's own
 * assetlinks.json. On Android an intent:// URL can name the app, so each gets
 * a button. iOS cannot target an app, so there the one link opens whichever
 * registered app iOS picks.
 */
const ANDROID_BANKS = [
    {name: 'monobank', packageName: 'com.ftband.mono'},
    {name: 'Privat24', packageName: 'ua.privatbank.ap24'},
    {name: 'ПУМБ', packageName: 'com.fuib.android.spot.online'},
    {name: 'A-Bank', packageName: 'ua.com.abank'},
    {name: 'Raiffeisen', packageName: 'ua.raiffeisen.myraif'},
    {name: 'izibank', packageName: 'ua.izibank.app'}
];

const androidBankUrl = (nbuQrUrl: string, packageName: string) => {
    const withoutScheme = nbuQrUrl.replace(/^https:\/\//, '');
    const storeUrl = `https://play.google.com/store/apps/details?id=${packageName}`;
    return `intent://${withoutScheme}#Intent;scheme=https;package=${packageName};` +
        `S.browser_fallback_url=${encodeURIComponent(storeUrl)};end`;
};

const formatMoney = (value: number) =>
    `₴${value.toLocaleString('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

const detectPlatform = () => {
    const userAgent = navigator.userAgent;
    if (/Android/i.test(userAgent)) return 'android';
    // iPadOS reports itself as a Mac, but a Mac has no touch screen.
    if (/iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        return 'ios';
    }
    return 'desktop';
};

export default function PayPage() {
    const {payToken} = useParams<{ payToken: string }>();
    const [page, setPage] = useState<PayPageResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [platform] = useState(detectPlatform);
    const [showQr, setShowQr] = useState(platform === 'desktop');

    useEffect(() => {
        if (!payToken) return;
        apiFetch(`${API_CONFIG.PUBLIC_PAY_URL}/${encodeURIComponent(payToken)}`)
            .then(async (response) => {
                if (response.ok) {
                    setPage(await response.json());
                } else {
                    setError(await getResponseErrorMessage(response, 'This payment link is not valid'));
                }
            })
            .catch(() => setError('Could not load the payment details. Try again in a moment.'));
    }, [payToken]);

    useEffect(() => {
        if (!page?.nbuQrUrl) return;
        // High error correction leaves room for the hryvnia mark the NBU format asks for in the middle.
        QRCode.toDataURL(page.nbuQrUrl, {errorCorrectionLevel: 'H', margin: 1, width: 560})
            .then(setQrDataUrl)
            .catch((err) => console.error('Failed to render QR code', err));
    }, [page?.nbuQrUrl]);

    const copy = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
        } catch {
            setCopied(null);
        }
    };

    if (error) {
        return (
            <main className="pay-page">
                <section className="pay-card">
                    <p className="pay-brand">FamSub</p>
                    <h1 className="pay-title">Link not valid</h1>
                    <p className="pay-muted">{error}</p>
                </section>
            </main>
        );
    }

    if (!page) {
        return (
            <main className="pay-page">
                <section className="pay-card"><p className="pay-muted">Loading…</p></section>
            </main>
        );
    }

    const hasDebt = page.amountDue > 0;
    const details = [
        {key: 'recipient', label: 'Recipient', value: page.recipientName},
        {key: 'iban', label: 'IBAN', value: page.iban},
        ...(hasDebt ? [{key: 'amount', label: 'Amount', value: page.amountDue.toFixed(2)}] : []),
        {key: 'purpose', label: 'Purpose', value: page.purpose}
    ];
    const allDetails = details.map((item) => `${item.label}: ${item.value}`).join('\n');

    return (
        <main className="pay-page">
            <section className="pay-card">
                <p className="pay-brand">FamSub</p>
                <p className="pay-greeting">Hi {page.subscriberName}</p>

                {hasDebt ? (
                    <>
                        <h1 className="pay-amount">{formatMoney(page.amountDue)}</h1>
                        <p className="pay-muted">
                            for {page.unpaidInvoiceCount} unpaid invoice{page.unpaidInvoiceCount === 1 ? '' : 's'}
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="pay-title">All paid up</h1>
                        <p className="pay-muted">
                            {page.credit > 0
                                ? `You have ${formatMoney(page.credit)} of credit. You can still top up with any amount.`
                                : 'Nothing to pay right now. You can still top up with any amount.'}
                        </p>
                    </>
                )}

                {page.nbuQrUrl && platform !== 'desktop' && (
                    <div className="pay-apps">
                        <a className="pay-primary" href={page.nbuQrUrl}>Pay in your banking app</a>
                        {platform === 'android' && (
                            <>
                                <p className="pay-muted pay-small">Or choose your bank:</p>
                                <div className="pay-banks">
                                    {ANDROID_BANKS.map((bank) => (
                                        <a key={bank.packageName} href={androidBankUrl(page.nbuQrUrl!, bank.packageName)}>
                                            {bank.name}
                                        </a>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {page.nbuQrUrl && (
                    <div className="pay-qr-block">
                        {showQr ? (
                            <>
                                <div className="pay-qr">
                                    {qrDataUrl ? <img src={qrDataUrl} alt="Payment QR code"/> : <div className="pay-qr-placeholder"/>}
                                    <span className="pay-qr-mark" aria-hidden="true">₴</span>
                                </div>
                                <p className="pay-muted pay-small">
                                    Scan with your phone's camera or your banking app's QR scanner.
                                </p>
                            </>
                        ) : (
                            <button type="button" className="pay-link-btn" onClick={() => setShowQr(true)}>
                                Show QR code
                            </button>
                        )}
                    </div>
                )}

                <div className="pay-details">
                    <div className="pay-details-head">
                        <h2>{page.nbuQrUrl ? 'Or transfer by IBAN' : 'Transfer by IBAN'}</h2>
                        <button type="button" className="pay-link-btn" onClick={() => copy('all', allDetails)}>
                            {copied === 'all' ? 'Copied' : 'Copy all'}
                        </button>
                    </div>
                    {details.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className="pay-detail"
                            onClick={() => copy(item.key, item.value)}
                        >
                            <span className="pay-detail-label">{item.label}</span>
                            <span className="pay-detail-value">{item.value}</span>
                            <span className="pay-detail-copy">{copied === item.key ? 'Copied' : 'Copy'}</span>
                        </button>
                    ))}
                    <p className="pay-note">
                        Keep the purpose exactly as it is: it is how your payment is recognised and marked as paid
                        automatically, usually within a few minutes.
                    </p>
                </div>
            </section>
        </main>
    );
}
