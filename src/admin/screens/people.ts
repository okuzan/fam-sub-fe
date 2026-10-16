/*
 * Data helpers shared by the People screens: Subscribers, Memberships, Services.
 */
import {API_CONFIG, apiFetch} from '../../config/api';
import {getResponseErrorMessage} from '../../utils/errors';
import type {MembershipResponse} from '../../types/membership';
import type {SubscriptionServiceResponse} from '../../types/subscription';

export async function getJson<T>(url: string, fallback: string): Promise<T> {
    const response = await apiFetch(url);
    if (!response.ok) throw new Error(await getResponseErrorMessage(response, fallback));
    return response.json() as Promise<T>;
}

export const getServices = () =>
    getJson<SubscriptionServiceResponse[]>(API_CONFIG.SUBSCRIPTION_SERVICES_URL, 'Could not load services');

/**
 * Every membership. The API lists memberships per service only, so this reads
 * each service's list and merges them.
 */
export async function getAllMemberships(services: SubscriptionServiceResponse[]): Promise<MembershipResponse[]> {
    const lists = await Promise.all(services.map((service) =>
        getJson<MembershipResponse[]>(
            `${API_CONFIG.MEMBERSHIPS_URL}/service/${service.id}`,
            `Could not load ${service.name} memberships`
        )
    ));
    return lists.flat();
}

/** In the month, inclusive at both ends; an open end runs forever. */
export const isActiveIn = (membership: MembershipResponse, month: string) =>
    membership.startMonth <= month && (!membership.endMonth || membership.endMonth >= month);

export const isEnded = (membership: MembershipResponse, month: string) =>
    Boolean(membership.endMonth && membership.endMonth < month);

/** Number of members per service id in the month. */
export const activeMemberCounts = (memberships: MembershipResponse[], month: string) => {
    const counts = new Map<string, number>();
    for (const membership of memberships) {
        if (!isActiveIn(membership, month)) continue;
        counts.set(membership.subscriptionServiceId, (counts.get(membership.subscriptionServiceId) ?? 0) + 1);
    }
    return counts;
};

/** A member's even share of a price, rounded down to cents as the backend's first-cut split. */
export const evenShare = (price: number, members: number) =>
    members > 0 ? Math.floor(Math.round(Number(price) * 100) / members) / 100 : Number(price);

export const sortByName = <T extends { name: string }>(items: T[]) =>
    [...items].sort((a, b) => a.name.localeCompare(b.name));

/** "1 240,50" or "1240.5" → 1240.5; null when it is not a number. */
export const parseAmount = (text: string): number | null => {
    const cleaned = text.replace(/[\s\u00a0₴]/g, '').replace(',', '.');
    if (!cleaned) return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
};
