import {type ReactNode, useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import QRCode from 'qrcode';
import {API_CONFIG, apiFetch} from '../config/api';
import {getResponseErrorMessage} from '../utils/errors';
import {formatMoney, formatMonthName, formatPeriod, plural} from '../ui/format';
import type {PayPageInvoice, PayPageResponse} from '../types/bankPayment';
import {bankUrl, banksFor, iosStoreFallback, STORE_FALLBACK_DELAY_MS} from './payBanks';
import './PayPage.css';

type Platform = 'android' | 'ios' | 'desktop';

const detectPlatform = (): Platform => {
    const userAgent = navigator.userAgent;
    if (/Android/i.test(userAgent)) return 'android';
    // iPadOS reports itself as a Mac, but a Mac has no touch screen.
    if (/iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        return 'ios';
    }
    return 'desktop';
};

/** "UA213220010000026201234567890" → "UA21 3220 0100 …" for reading; copying uses the raw value. */
const groupIban = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');

const monthsBetween = (from: string, to: string) => {
    const months: string[] = [];
    let [year, month] = from.split('-').map(Number);
    const [toYear, toMonth] = to.split('-').map(Number);
    while ((year < toYear || (year === toYear && month <= toMonth)) && months.length < 36) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return months;
};

/** "Jul and Aug 2026", "Jun, Jul and Aug 2026", "Dec 2025 and Jan 2026", or a range when there are many. */
const describeMonths = (invoices: PayPageInvoice[]) => {
    const months = [...new Set(invoices.flatMap((invoice) => monthsBetween(invoice.fromMonth, invoice.toMonth)))].sort();
    if (months.length === 0) return '';
    if (months.length > 4) return formatPeriod(months[0], months[months.length - 1]);
    const sameYear = months.every((month) => month.slice(0, 4) === months[0].slice(0, 4));
    const names = months.map((month, index) => {
        const short = formatMonthName(month);
        return sameYear && index < months.length - 1 ? short : `${short} ${month.slice(0, 4)}`;
    });
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const paymentCodeOf = (purpose: string) => purpose.match(/FS-[A-Z0-9]+/i)?.[0] ?? null;

interface DetailRow {
    key: string;
    label: string;
    display: string;
    /** Null when there is nothing to copy (top-up: any amount). */
    copyValue: string | null;
    highlight?: boolean;
}

function PayShell({children, wide = false}: { children: ReactNode; wide?: boolean }) {
    return (
        <main className="pay-page">
            <div className={`pay-column ${wide ? 'is-wide' : ''}`}>
                <div className="pay-brand">
                    <img src="/favicon.svg" alt="" width={16} height={16}/>
                    <span>FamSub</span>
                </div>
                {children}
            </div>
        </main>
    );
}

export default function PayPage() {
    const {payToken} = useParams<{ payToken: string }>();
    const [page, setPage] = useState<PayPageResponse | null>(null);
    const [error, setError] = useState<{ title: string; text: string } | null>(null);
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [platform] = useState(detectPlatform);
    const [isWide, setIsWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);

    useEffect(() => {
        const query = window.matchMedia('(min-width: 900px)');
        const onChange = () => setIsWide(query.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (!payToken) return;
        apiFetch(`${API_CONFIG.PUBLIC_PAY_URL}/${encodeURIComponent(payToken)}`)
            .then(async (response) => {
                if (response.ok) {
                    setPage(await response.json());
                } else if (response.status >= 500) {
                    setError({
                        title: 'Couldn’t load the payment details',
                        text: await getResponseErrorMessage(response, 'Something went wrong on our side. Try again in a moment.')
                    });
                } else {
                    setError({
                        title: 'This pay link doesn’t work',
                        text: 'It may be mistyped or replaced by a newer one. Open the link in your latest FamSub ' +
                            'email, or ask whoever sends your invoices for a fresh one.'
                    });
                }
            })
            .catch(() => setError({
                title: 'Couldn’t load the payment details',
                text: 'Check your connection and try again in a moment.'
            }));
    }, [payToken]);

    useEffect(() => {
        if (!page?.nbuQrUrl) return;
        // High error correction leaves room for the hryvnia mark the NBU format asks for in the middle.
        QRCode.toDataURL(page.nbuQrUrl, {errorCorrectionLevel: 'H', margin: 0, width: 560})
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

    /*
     * An iOS URL scheme gives no signal when the app is missing, so if the
     * page is still on screen after the delay, send them to the App Store.
     * Safari's "Open in …?" sheet keeps the page visible, hence the long delay.
     */
    const openStoreIfStillHere = (storeUrl: string | null) => {
        if (!storeUrl) return;
        const timer = window.setTimeout(() => {
            cleanup();
            if (document.visibilityState === 'visible') window.location.assign(storeUrl);
        }, STORE_FALLBACK_DELAY_MS);
        const onHide = () => {
            if (document.visibilityState !== 'visible') cleanup();
        };
        const cleanup = () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', cleanup);
        };
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', cleanup);
    };

    if (!payToken && !error) {
        return (
            <PayShell>
                <section className="pay-card pay-message">
                    <h1 className="pay-message-title">This pay link doesn’t work</h1>
                    <p className="pay-message-text">Open the link in your latest FamSub email.</p>
                </section>
            </PayShell>
        );
    }

    if (error) {
        return (
            <PayShell>
                <section className="pay-card pay-message">
                    <h1 className="pay-message-title">{error.title}</h1>
                    <p className="pay-message-text">{error.text}</p>
                </section>
            </PayShell>
        );
    }

    if (!page) {
        return (
            <PayShell>
                <section className="pay-card pay-loading" aria-busy="true" aria-label="Loading">
                    <span className="pay-skel" style={{width: '40%'}}/>
                    <span className="pay-skel is-big"/>
                    <span className="pay-skel" style={{width: '55%'}}/>
                </section>
            </PayShell>
        );
    }

    const hasDebt = page.amountDue > 0;
    const qrUrl = page.nbuQrUrl;
    const desktop = platform === 'desktop' && isWide && qrUrl !== null;
    const paymentCode = paymentCodeOf(page.purpose);
    const rawIban = page.iban.replace(/\s+/g, '');

    const rows: DetailRow[] = [
        {key: 'recipient', label: 'Recipient', display: page.recipientName, copyValue: page.recipientName},
        {key: 'iban', label: 'IBAN', display: groupIban(page.iban), copyValue: rawIban},
        hasDebt
            ? {key: 'amount', label: 'Amount', display: formatMoney(page.amountDue), copyValue: page.amountDue.toFixed(2)}
            : {key: 'amount', label: 'Amount', display: 'Any amount', copyValue: null},
        {key: 'purpose', label: 'Purpose', display: page.purpose, copyValue: page.purpose, highlight: true}
    ];
    const allDetails = rows
        .filter((row) => row.copyValue !== null)
        .map((row) => `${row.label}: ${row.copyValue}`)
        .join('\n');

    const invoiceSummary = page.unpaidInvoiceCount > 0
        ? [plural(page.unpaidInvoiceCount, 'invoice'), describeMonths(page.unpaidInvoices)].filter(Boolean).join(' · ')
        : null;

    const summary = hasDebt ? (
        <div className="pay-summary">
            <span className="pay-greeting">{page.subscriberName}, you owe</span>
            <span className="pay-amount">{formatMoney(page.amountDue)}</span>
            {!desktop && invoiceSummary && <span className="pay-summary-note">{invoiceSummary}</span>}
        </div>
    ) : (
        <div className="pay-summary">
            <span className="pay-greeting">{page.subscriberName}, nothing to pay</span>
            {page.credit > 0 ? (
                <>
                    <span className="pay-amount is-credit">{formatMoney(page.credit)}</span>
                    <span className="pay-summary-note">credit on your balance. It goes toward your next invoices.</span>
                </>
            ) : (
                <span className="pay-summary-note">
                    All your invoices are paid. You can still top up with any amount.
                </span>
            )}
        </div>
    );

    const detailsBlock = (
        <div className={`pay-details ${desktop ? 'is-wide' : ''}`}>
            {rows.map((row) => (
                <div key={row.key} className={`pay-row ${row.highlight ? 'is-highlight' : ''}`}>
                    <span className="pay-row-label">{row.label}</span>
                    <span className={`pay-row-value ${row.copyValue === null ? 'is-muted' : ''}`}>{row.display}</span>
                    {row.copyValue !== null ? (
                        <button
                            type="button"
                            className="pay-copy"
                            onClick={() => copy(row.key, row.copyValue!)}
                            aria-label={`Copy ${row.label.toLowerCase()}`}
                        >
                            {copied === row.key ? 'Copied' : 'Copy'}
                        </button>
                    ) : <span className="pay-copy-gap" aria-hidden="true"/>}
                </div>
            ))}
            <button type="button" className="pay-copy-all" onClick={() => copy('all', allDetails)}>
                {copied === 'all' ? 'Copied' : 'Copy all'}
            </button>
        </div>
    );

    const notice = (
        <p className="pay-notice">
            <strong>Keep the purpose unchanged.</strong>{' '}
            FamSub reads {paymentCode ?? 'the code'} in it to recognise your payment
            {hasDebt ? ' and settle your invoices.' : ' and add it to your balance.'}
        </p>
    );

    const qrBlock = (caption: string) => (
        <div className="pay-qr-block">
            <div className="pay-qr">
                {qrDataUrl ? <img src={qrDataUrl} alt="Payment QR code"/> : <div className="pay-qr-placeholder"/>}
                <span className="pay-qr-mark" aria-hidden="true">₴</span>
            </div>
            <p className="pay-qr-caption">{caption}</p>
        </div>
    );

    if (desktop) {
        return (
            <PayShell wide>
                <section className="pay-card pay-desktop">
                    <div className="pay-desktop-head">
                        {summary}
                        {page.unpaidInvoices.length > 0 && (
                            <ul className="pay-desktop-invoices">
                                {page.unpaidInvoices.map((invoice, index) => (
                                    <li key={`${invoice.fromMonth}-${index}`}>
                                        <span>
                                            {formatPeriod(invoice.fromMonth, invoice.toMonth)}
                                            {' · '}open {plural(invoice.openDays, 'day')}
                                        </span>
                                        <span className="pay-invoice-amount">{formatMoney(invoice.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="pay-desktop-body">
                        {qrBlock(hasDebt
                            ? 'Scan with your phone camera or your bank app. Amount and purpose come filled in.'
                            : 'Scan with your phone camera or your bank app. The purpose comes filled in; enter any amount.')}
                        <div className="pay-desktop-side">
                            {detailsBlock}
                            {notice}
                            <a className="pay-text-link" href={qrUrl!}>Open in your banking app instead →</a>
                            <a className="pay-text-link" href="https://next.privat24.ua" target="_blank" rel="noopener noreferrer">
                                Pay in Privat24 on the web →
                            </a>
                        </div>
                    </div>
                </section>
            </PayShell>
        );
    }

    return (
        <PayShell>
            <section className="pay-card pay-main">
                {summary}

                {qrUrl && platform !== 'desktop' && (
                    <div className="pay-apps">
                        <a className={`pay-primary ${hasDebt ? '' : 'is-secondary'}`} href={qrUrl}>
                            {hasDebt ? 'Pay in your banking app' : 'Top up in your banking app'}
                        </a>
                        {platform !== 'android' && (
                            <span className="pay-apps-note">
                                Opens monobank, Privat24 or your bank’s app with the
                                {hasDebt ? ' amount and purpose' : ' purpose'} filled in.
                            </span>
                        )}
                    </div>
                )}

                {qrUrl && platform !== 'desktop' && (
                    <div className="pay-banks-block">
                        <span className="pay-label">Or open a specific bank</span>
                        <div className="pay-banks">
                            {banksFor(platform).map((bank) => (
                                <a
                                    key={bank.code}
                                    className="pay-bank"
                                    href={bankUrl(bank, platform, qrUrl)}
                                    onClick={() => openStoreIfStillHere(iosStoreFallback(bank))}
                                >
                                    <span
                                        className="pay-bank-badge"
                                        style={{color: bank.color, background: bank.background}}
                                        aria-hidden="true"
                                    >
                                        {bank.letter}
                                    </span>
                                    <span className="pay-bank-name">{bank.name}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {/* A phone can't scan its own screen, so the QR is for computers only. */}
                {qrUrl && platform === 'desktop' && qrBlock('Scan with your phone camera or your bank app.')}

                {qrUrl && (
                    <div className="pay-divider">
                        <span/>
                        <span className="pay-label">Or pay by details</span>
                        <span/>
                    </div>
                )}

                {detailsBlock}
                {notice}
            </section>

            {page.unpaidInvoices.length > 0 && (
                <section className="pay-card pay-invoices">
                    {page.unpaidInvoices.map((invoice, index) => (
                        <div key={`${invoice.fromMonth}-${index}`} className="pay-invoice">
                            <div className="pay-invoice-text">
                                <span className="pay-invoice-period">{formatPeriod(invoice.fromMonth, invoice.toMonth)}</span>
                                <span className="pay-invoice-meta">open {plural(invoice.openDays, 'day')}</span>
                            </div>
                            <span className="pay-invoice-amount">{formatMoney(invoice.amount)}</span>
                        </div>
                    ))}
                </section>
            )}
        </PayShell>
    );
}
