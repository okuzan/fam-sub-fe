import type {SubscriberResponse} from '../../types/subscriber';
import {archivedSince, instantMonth} from './people';

/**
 * The `<option>`s of a subscriber dropdown: active people first, archived
 * people grouped at the bottom, each marked "since Jul 2026", in the order given.
 */
export default function SubscriberOptions({subscribers, label = (subscriber) => subscriber.name}: {
    subscribers: SubscriberResponse[];
    label?: (subscriber: SubscriberResponse) => string;
}) {
    const active = subscribers.filter((subscriber) => !subscriber.archived);
    const archived = subscribers.filter((subscriber) => subscriber.archived);
    const option = (subscriber: SubscriberResponse) => (
        <option key={subscriber.id} value={subscriber.id}>
            {subscriber.archived
                ? `${label(subscriber)} · since ${instantMonth(archivedSince(subscriber))}`
                : label(subscriber)}
        </option>
    );
    return (
        <>
            {active.map(option)}
            {archived.length > 0 && <optgroup label="Archived">{archived.map(option)}</optgroup>}
        </>
    );
}
