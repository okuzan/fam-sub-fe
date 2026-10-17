/*
 * Per-bank buttons for the pay page. Every bank app reads the same NBU
 * payment link (https://bank.gov.ua/qr/<payload>); what differs is how to
 * hand it to one specific app:
 *
 * - Android: an intent:// URL names the app's package, with the Play Store
 *   as the fallback when it is not installed.
 * - iOS: the bank's own URL scheme carrying the same payload
 *   (mono://bank.gov.ua/qr/<payload>), or a universal link on the bank's
 *   domain. A scheme gives no "not installed" signal, so the page goes to
 *   the App Store when it is still on screen after a delay.
 *
 * The routes follow the ones foppay.com.ua (fop.one) and perfectmeals.com.ua
 * ship on their pay pages; where they differ (Raiffeisen), the universal link
 * wins, because it needs no App Store guess. A bank with no known route on a
 * platform is left out there.
 */

export const NBU_QR_PREFIX = 'https://bank.gov.ua/qr/';

type IosLaunch =
    | { type: 'scheme'; prefix: string; store: string }
    | { type: 'universal'; prefix: string }
    | { type: 'nbu' };

interface AndroidLaunch {
    package: string;
    /** Host and path of the bank's own app link, when it does not claim bank.gov.ua. */
    applink?: string;
}

export interface PayBank {
    code: string;
    name: string;
    /** The bank's own App Store icon, under public/banks. */
    icon: string;
    ios: IosLaunch | null;
    android: AndroidLaunch | null;
}

export const PAY_BANKS: PayBank[] = [
    {
        code: 'mono', name: 'monobank', icon: '/banks/mono.png',
        ios: {type: 'scheme', prefix: 'mono://bank.gov.ua/qr/', store: 'https://apps.apple.com/ua/app/id1287005205'},
        android: {package: 'com.ftband.mono'}
    },
    {
        code: 'privat', name: 'Privat24', icon: '/banks/privat.png',
        ios: {type: 'scheme', prefix: 'privat24://bank.gov.ua/qr/', store: 'https://apps.apple.com/ua/app/id1333984846'},
        android: {package: 'ua.privatbank.ap24'}
    },
    {
        code: 'oschad', name: 'Ощадбанк', icon: '/banks/oschad.png',
        ios: {type: 'universal', prefix: 'https://online.oschadbank.ua/images/deeplinks/flumo/'},
        android: {package: 'ua.oschadbank.flumo', applink: 'online.oschadbank.ua/images/deeplinks/flumo/'}
    },
    {
        code: 'abank', name: 'А-Банк', icon: '/banks/abank.png',
        ios: {type: 'scheme', prefix: 'abank24://bank.gov.ua/qr/', store: 'https://apps.apple.com/ua/app/id1261267716'},
        android: {package: 'ua.com.abank'}
    },
    {
        code: 'pumb', name: 'ПУМБ', icon: '/banks/pumb.png',
        ios: {type: 'universal', prefix: 'https://mobile-app.pumb.ua/bank.gov.ua/qr/'},
        android: {package: 'com.fuib.android.spot.online'}
    },
    {
        code: 'raiff', name: 'Raiffeisen', icon: '/banks/raiff.png',
        ios: {type: 'universal', prefix: 'https://my-raif.apps.raiffeisen.ua/qr?payload='},
        android: {package: 'ua.raiffeisen.myraif'}
    },
    {
        code: 'sense', name: 'Sense', icon: '/banks/sense.png',
        ios: {type: 'nbu'},
        android: {package: 'ua.alfabank.mobile.android'}
    },
    {
        code: 'izi', name: 'izibank', icon: '/banks/izi.png',
        ios: null,
        android: {package: 'ua.izibank.app'}
    }
];

/** How long a scheme tap may leave the page visible before assuming the app is missing. */
export const STORE_FALLBACK_DELAY_MS = 2500;

export const banksFor = (platform: 'ios' | 'android') =>
    PAY_BANKS.filter((bank) => (platform === 'ios' ? bank.ios : bank.android) !== null);

export function bankUrl(bank: PayBank, platform: 'ios' | 'android', nbuQrUrl: string): string {
    const payload = nbuQrUrl.startsWith(NBU_QR_PREFIX) ? nbuQrUrl.slice(NBU_QR_PREFIX.length) : '';
    if (platform === 'android') {
        const android = bank.android!;
        const host = android.applink ? android.applink + payload : nbuQrUrl.replace(/^https:\/\//, '');
        // Chrome reads everything after #Intent; as fields, so the fallback must be encoded.
        const store = encodeURIComponent(`https://play.google.com/store/apps/details?id=${android.package}`);
        return `intent://${host}#Intent;scheme=https;package=${android.package};S.browser_fallback_url=${store};end`;
    }
    const ios = bank.ios!;
    return ios.type === 'nbu' ? nbuQrUrl : ios.prefix + payload;
}

/** The App Store page to fall back to after an iOS scheme tap, or null when iOS handles it. */
export const iosStoreFallback = (bank: PayBank) => bank.ios?.type === 'scheme' ? bank.ios.store : null;
