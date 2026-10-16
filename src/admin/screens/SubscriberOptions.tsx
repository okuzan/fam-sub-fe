import type {SubscriberResponse} from '../../types/subscriber';

/**
 * The `<option>`s of a subscriber dropdown: active people first, archived
 * people grouped at the bottom, each group in the order given.
 */
export default function SubscriberOptions({subscribers, label = (subscriber) => subscriber.name}: {
    subscribers: SubscriberResponse[];
    label?: (subscriber: SubscriberResponse) => string;
}) {
    const active = subscribers.filter((subscriber) => !subscriber.archived);
    const archived = subscribers.filter((subscriber) => subscriber.archived);
    const option = (subscriber: SubscriberResponse) => (
        <option key={subscriber.id} value={subscriber.id}>{label(subscriber)}</option>
    );
    return (
        <>
            {active.map(option)}
            {archived.length > 0 && <optgroup label="Archived">{archived.map(option)}</optgroup>}
        </>
    );
}
