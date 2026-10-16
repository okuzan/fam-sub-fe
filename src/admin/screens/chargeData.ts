import {API_CONFIG, apiFetch} from '../../config/api';
import type {ChargePageResponse, ChargeResponse} from '../../types/charge';
import type {SubscriptionServiceResponse} from '../../types/subscription';
import {getResponseErrorMessage} from '../../utils/errors';

/** The largest page the charges endpoint serves. */
const PAGE_SIZE = 50;

/**
 * Every charge of every service. The API only lists charges per service, a
 * page at a time, so this walks each service's pages. Newest month first,
 * then service name.
 */
export async function fetchAllCharges(services: SubscriptionServiceResponse[]): Promise<ChargeResponse[]> {
    const perService = await Promise.all(services.map(async (service) => {
        const charges: ChargeResponse[] = [];
        for (let page = 0; ; page += 1) {
            const response = await apiFetch(
                `${API_CONFIG.CHARGES_URL}/service/${service.id}?page=${page}&size=${PAGE_SIZE}`
            );
            if (!response.ok) {
                throw new Error(await getResponseErrorMessage(response, `Couldn't load charges for ${service.name}`));
            }
            const data: ChargePageResponse = await response.json();
            charges.push(...data.content);
            if (page + 1 >= data.totalPages) break;
        }
        return charges;
    }));
    return perService.flat().sort((a, b) =>
        b.chargeMonth.localeCompare(a.chargeMonth)
        || a.subscriptionServiceName.localeCompare(b.subscriptionServiceName)
    );
}

export async function fetchServices(): Promise<SubscriptionServiceResponse[]> {
    const response = await apiFetch(API_CONFIG.SUBSCRIPTION_SERVICES_URL);
    if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, "Couldn't load services"));
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

/** True once a cost calculation has used the charge: the API then refuses edits and deletes. */
export async function isChargeCalculated(chargeId: string): Promise<boolean> {
    const response = await apiFetch(`${API_CONFIG.LEDGER_URL}/filter`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({chargeId})
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Array.isArray(data) && data.length > 0;
}

export const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;
