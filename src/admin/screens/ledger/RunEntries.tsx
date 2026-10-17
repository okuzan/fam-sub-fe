import type {LedgerEntry} from '../../../types/ledger';
import {Tag} from '../../../ui/components';
import {formatAmount, formatMoney, formatMonth, plural, shareLabel} from '../../../ui/format';
import {groupByCharge, sumAmounts} from './ledgerModel';
import {useSubscriberNames} from '../../subscriberNames';
import {SortHeader} from '../../../ui/sorting';
import {useSort} from '../../../ui/useSort';

interface EntriesProps {
    entries: LedgerEntry[];
    onOpenEntry: (entryId: string) => void;
}

/** A run's entries, one row per charge: "510,00 ÷ 4", who shared it, and each share. */
export function GroupedEntries({entries, onOpenEntry, showMonth}: EntriesProps & { showMonth: boolean }) {
    const names = useSubscriberNames();
    const groups = groupByCharge(entries);
    return (
        <>
            <ul className="led-groups">
                {groups.map((group) => (
                    <li key={group.chargeId} className="led-group">
                        <div className="led-group-service">
                            <span className="led-group-name">{group.serviceName}</span>
                            <span className="led-group-split">
                                {formatAmount(group.total)} {group.weighted ? 'by share' : `÷ ${group.participantCount}`}
                                {showMonth && <> · {formatMonth(group.month)}</>}
                            </span>
                        </div>
                        <div className="led-chips">
                            {group.entries.map((entry) => (
                                <button key={entry.id} type="button"
                                        className={`led-chip ${entry.invoiceId ? '' : 'is-open'}`}
                                        title={`${names.full(entry.subscriberId, entry.subscriberName)} · ${formatMoney(entry.amount)}${entry.invoiceId ? ' · invoiced' : ' · not invoiced'}`}
                                        onClick={() => onOpenEntry(entry.id)}>
                                    {names.short(entry.subscriberId, entry.subscriberName)}
                                </button>
                            ))}
                        </div>
                        <div className="led-group-each">
                            <span className="led-group-amount">
                                {group.minAmount === group.maxAmount
                                    ? formatMoney(group.maxAmount)
                                    : `${formatAmount(group.minAmount)}–${formatMoney(group.maxAmount)}`}
                            </span>
                            <span className="led-group-each-label">each</span>
                        </div>
                    </li>
                ))}
            </ul>
            <div className="led-total">
                <span>{plural(groups.length, 'charge')}</span>
                <span className="led-total-amount">{formatMoney(sumAmounts(entries.map((entry) => entry.amount)))}</span>
            </div>
        </>
    );
}

/** Filter results: one row per entry, click for the full record. */
export function EntryTable({entries, onOpenEntry}: EntriesProps) {
    const names = useSubscriberNames();
    const {sorted, sort, toggle} = useSort(entries, {
        service: (entry: LedgerEntry) => entry.subscriptionServiceName,
        subscriber: (entry: LedgerEntry) => names.full(entry.subscriberId, entry.subscriberName),
        month: (entry: LedgerEntry) => entry.recordedMonth,
        share: (entry: LedgerEntry) => Number(entry.amount)
    });
    return (
        <>
            <div className="ui-table-wrap">
                <table className="ui-table led-entry-table">
                    <thead>
                    <tr>
                        <SortHeader column="service" label="Service" sort={sort} onSort={toggle}/>
                        <SortHeader column="subscriber" label="Subscriber" sort={sort} onSort={toggle}/>
                        <SortHeader column="month" label="Month" sort={sort} onSort={toggle}/>
                        <SortHeader column="share" label="Share" sort={sort} onSort={toggle} className="is-num"/>
                        <th>Invoice</th>
                    </tr>
                    </thead>
                    <tbody>
                    {sorted.map((entry) => (
                        <tr key={entry.id} className="is-clickable" tabIndex={0}
                            onClick={() => onOpenEntry(entry.id)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') onOpenEntry(entry.id);
                            }}>
                            <td className="is-strong">
                                {entry.subscriptionServiceName}
                                <span className="ui-cell-sub">
                                    {shareLabel(entry).replace(/^./, (first) => first.toUpperCase())}
                                    {entry.chargeDescription && ` · ${entry.chargeDescription}`}
                                </span>
                            </td>
                            <td>{names.short(entry.subscriberId, entry.subscriberName)}</td>
                            <td>{formatMonth(entry.recordedMonth)}</td>
                            <td className="is-num">{formatMoney(entry.amount)}</td>
                            <td>{entry.invoiceId ? <Tag tone="green">Invoiced</Tag> : <Tag tone="grey">Open</Tag>}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
            <div className="led-total">
                <span>{plural(entries.length, 'entry', 'entries')}</span>
                <span className="led-total-amount">{formatMoney(sumAmounts(entries.map((entry) => entry.amount)))}</span>
            </div>
        </>
    );
}
