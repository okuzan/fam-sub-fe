/*
 * How admin screens name a subscriber. Lists and tables use the short form,
 * "Андрій У.", which tells two Андріїs apart without widening columns;
 * dropdowns and drawer titles use the full name. API responses carry only
 * `subscriberName` (the first name, which emails and the pay page greet
 * with), so the surname is looked up here by subscriber id.
 */
import {useEffect, useMemo, useState} from 'react';
import {API_CONFIG, apiFetch} from '../config/api';
import type {SubscriberResponse} from '../types/subscriber';

interface Person {
    name: string;
    surname?: string | null;
}

export const shortName = ({name, surname}: Person) => {
    const initial = surname?.trim().charAt(0);
    return initial ? `${name} ${initial.toLocaleUpperCase()}.` : name;
};

export const fullName = ({name, surname}: Person) => surname?.trim() ? `${name} ${surname.trim()}` : name;

type Directory = Map<string, Person>;

let directory: Promise<Directory> | null = null;

const toDirectory = (subscribers: SubscriberResponse[]): Directory =>
    new Map(subscribers.map((subscriber) => [subscriber.id, {name: subscriber.name, surname: subscriber.surname}]));

/** Screens that load the subscriber list anyway hand it over, so names stay current without another request. */
export const primeSubscriberNames = (subscribers: SubscriberResponse[]) => {
    directory = Promise.resolve(toDirectory(subscribers));
};

const loadDirectory = () => {
    directory ??= apiFetch(API_CONFIG.SUBSCRIBERS_URL)
        .then((response) => response.ok ? response.json() as Promise<SubscriberResponse[]> : [])
        .then(toDirectory)
        .catch(() => {
            directory = null;
            return new Map();
        });
    return directory;
};

/**
 * Names by subscriber id. Until the list arrives, or for an id it doesn't
 * know, each returns the fallback (the response's own `subscriberName`).
 */
export function useSubscriberNames() {
    const [people, setPeople] = useState<Directory>(new Map());
    useEffect(() => {
        let live = true;
        loadDirectory().then((loaded) => live && setPeople(loaded));
        return () => {
            live = false;
        };
    }, []);
    return useMemo(() => {
        const find = (id: string | null | undefined) => (id ? people.get(id) : undefined);
        return {
            short: (id: string | null | undefined, fallback: string) => {
                const person = find(id);
                return person ? shortName(person) : fallback;
            },
            full: (id: string | null | undefined, fallback: string) => {
                const person = find(id);
                return person ? fullName(person) : fallback;
            }
        };
    }, [people]);
}
