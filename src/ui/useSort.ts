import {useMemo, useState} from 'react';

/*
 * Click-to-sort table columns, with SortHeader (sorting.tsx) as the header.
 * A column maps a row to a number, a string, or null; nulls always go last.
 * The first click sorts numbers biggest first and text A to Z, the second
 * reverses it, and the third goes back to the table's own order.
 */

type SortValue = number | string | null | undefined;
type Direction = 'asc' | 'desc';

export type SortDirection = Direction;

export type SortColumns<T, K extends string> = Record<K, (row: T) => SortValue>;

const compareValues = (a: SortValue, b: SortValue) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'uk', {numeric: true, sensitivity: 'base'});
};

export function useSort<T, K extends string>(rows: T[], columns: SortColumns<T, K>) {
    const [sort, setSort] = useState<{ key: K; direction: Direction } | null>(null);

    const sorted = useMemo(() => {
        if (!sort) return rows;
        const value = columns[sort.key];
        const sign = sort.direction === 'asc' ? 1 : -1;
        return [...rows].sort((left, right) => {
            const a = value(left);
            const b = value(right);
            const aMissing = a === null || a === undefined || a === '';
            const bMissing = b === null || b === undefined || b === '';
            if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);
            return sign * compareValues(a, b);
        });
        // Columns are declared inline by callers; their identity changing must not re-sort.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, sort]);

    const toggle = (key: K) => {
        const sample = rows.map(columns[key]).find((value) => value !== null && value !== undefined);
        const first: Direction = typeof sample === 'number' ? 'desc' : 'asc';
        setSort((current) => {
            if (!current || current.key !== key) return {key, direction: first};
            if (current.direction === first) return {key, direction: first === 'asc' ? 'desc' : 'asc'};
            return null;
        });
    };

    return {sorted, sort, toggle};
}

