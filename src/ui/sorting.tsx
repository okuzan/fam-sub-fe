import type {SortDirection} from './useSort';

/** A table header that sorts its column; pair it with useSort. */
export function SortHeader<K extends string>({column, label, sort, onSort, className = ''}: {
    column: K;
    label: string;
    sort: { key: K; direction: SortDirection } | null;
    onSort: (key: K) => void;
    className?: string;
}) {
    const active = sort?.key === column;
    return (
        <th
            className={`ui-sort-th ${className}`}
            aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
            <button type="button" className={`ui-sort ${active ? 'is-active' : ''}`} onClick={() => onSort(column)}>
                {label}
                <span className="ui-sort-mark" aria-hidden="true">
                    {active ? (sort!.direction === 'asc' ? '↑' : '↓') : '↕'}
                </span>
            </button>
        </th>
    );
}
