import {type ReactNode, useEffect, useState} from 'react';
import {API_CONFIG, apiFetch} from '../../../config/api';
import type {CostCalculationSuggestion} from '../../../types/costCalculation';
import type {LedgerEntry} from '../../../types/ledger';
import type {SubscriberResponse} from '../../../types/subscriber';
import {Drawer, DrawerSection, Field, Notice, Tag} from '../../../ui/components';
import {formatMoney, formatMonthLong, formatPeriod, formatWhen, shareLabel} from '../../../ui/format';
import {getResponseErrorMessage} from '../../../utils/errors';
import {actorName, ADVANCED_KEYS, isUuid, type LedgerFilters} from './ledgerModel';
import {useSubscriberNames} from '../../subscriberNames';

/* ── Calculate a range of months ───────────────────────── */

interface RangeDrawerProps {
    suggestion: CostCalculationSuggestion | null;
    running: boolean;
    onClose: () => void;
    onRun: (fromMonth: string, toMonth: string) => void;
}

export function RangeDrawer({suggestion, running, onClose, onRun}: RangeDrawerProps) {
    const [fromMonth, setFromMonth] = useState(suggestion?.suggestedFromMonth ?? '');
    const [toMonth, setToMonth] = useState(suggestion?.suggestedToMonth ?? '');
    const [touched, setTouched] = useState(false);

    let error: string | undefined;
    if (!fromMonth || !toMonth) error = 'Choose both months.';
    else if (fromMonth > toMonth) error = 'The first month must come before the last one.';

    return (
        <Drawer
            open
            title="Calculate several months"
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
                    <button type="button" className="ui-btn is-primary" disabled={Boolean(error) || running}
                            onClick={() => onRun(fromMonth, toMonth)}>
                        {running ? 'Calculating…' : 'Run cost calculation'}
                    </button>
                </>
            }
        >
            <p className="led-drawer-lead">
                Every charge in the range that hasn’t been split yet is split across its month’s members.
                Charges already calculated are skipped.
            </p>
            {suggestion && (
                <Notice tone="grey">
                    <div className="led-suggestion">
                        <span>
                            Suggested: <strong>{formatPeriod(suggestion.suggestedFromMonth, suggestion.suggestedToMonth)}</strong>
                            {suggestion.lastCalculatedToMonth && (
                                <> · calculated through {formatMonthLong(suggestion.lastCalculatedToMonth)}</>
                            )}
                        </span>
                        <button type="button" className="ui-link-btn" onClick={() => {
                            setFromMonth(suggestion.suggestedFromMonth);
                            setToMonth(suggestion.suggestedToMonth);
                        }}>Use it</button>
                    </div>
                </Notice>
            )}
            <Field label="From" htmlFor="led-range-from" error={touched ? error : undefined}>
                <input id="led-range-from" type="month" className="ui-input" value={fromMonth}
                       onChange={(event) => {
                           setFromMonth(event.target.value);
                           setTouched(true);
                       }}/>
            </Field>
            <Field label="To" htmlFor="led-range-to">
                <input id="led-range-to" type="month" className="ui-input" value={toMonth} min={fromMonth || undefined}
                       onChange={(event) => {
                           setToMonth(event.target.value);
                           setTouched(true);
                       }}/>
            </Field>
        </Drawer>
    );
}

/* ── More ledger filters ───────────────────────────────── */

interface FiltersDrawerProps {
    filters: LedgerFilters;
    hasRun: boolean;
    onClose: () => void;
    onApply: (filters: LedgerFilters) => void;
}

const ID_FIELDS: Array<{ key: 'generatedByAccountId' | 'invoiceId' | 'id' | 'chargeId'; label: string; hint: string }> = [
    {key: 'id', label: 'Ledger entry ID', hint: 'Exact ID of one entry.'},
    {key: 'chargeId', label: 'Charge ID', hint: 'Every split of one charge.'},
    {key: 'invoiceId', label: 'Invoice ID', hint: 'Entries billed on one invoice.'},
    {key: 'generatedByAccountId', label: 'Run by account ID', hint: 'Runs started by one admin account.'}
];

export function FiltersDrawer({filters, hasRun, onClose, onApply}: FiltersDrawerProps) {
    const [draft, setDraft] = useState<LedgerFilters>(filters);
    const set = <K extends keyof LedgerFilters>(key: K, value: LedgerFilters[K]) =>
        setDraft((current) => ({...current, [key]: value}));

    const idError = (value: string) => (value.trim() && !isUuid(value) ? 'That isn’t a full ID.' : undefined);
    const rangeError = draft.fromMonth && draft.toMonth && draft.fromMonth > draft.toMonth
        ? 'The first month must come before the last one.'
        : undefined;
    const invalid = Boolean(rangeError) || ID_FIELDS.some(({key}) => idError(draft[key]));

    const clear = () => {
        const next = {...draft, allRuns: false};
        ADVANCED_KEYS.forEach((key) => {
            next[key] = '';
        });
        setDraft(next);
    };

    return (
        <Drawer
            open
            title="More filters"
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="ui-btn" onClick={clear}>Clear these</button>
                    <button type="button" className="ui-btn is-primary" disabled={invalid}
                            onClick={() => onApply(draft)}>Apply</button>
                </>
            }
        >
            {hasRun && (
                <label className="ui-checkbox">
                    <input type="checkbox" checked={draft.allRuns}
                           onChange={(event) => set('allRuns', event.target.checked)}/>
                    Search every run, not only the selected one
                </label>
            )}
            <div className="led-drawer-pair">
                <Field label="From month" htmlFor="led-f-from" error={rangeError}>
                    <input id="led-f-from" type="month" className="ui-input" value={draft.fromMonth}
                           onChange={(event) => set('fromMonth', event.target.value)}/>
                </Field>
                <Field label="To month" htmlFor="led-f-to">
                    <input id="led-f-to" type="month" className="ui-input" value={draft.toMonth}
                           onChange={(event) => set('toMonth', event.target.value)}/>
                </Field>
            </div>
            {ID_FIELDS.map(({key, label, hint}) => (
                <Field key={key} label={label} optional htmlFor={`led-f-${key}`} hint={hint} error={idError(draft[key])}>
                    <input id={`led-f-${key}`} className="ui-input led-mono-input" autoComplete="off" spellCheck={false}
                           value={draft[key]} onChange={(event) => set(key, event.target.value)}/>
                </Field>
            ))}
        </Drawer>
    );
}

/* ── One ledger entry ──────────────────────────────────── */

interface EntryDrawerProps {
    entryId: string;
    subscribers: SubscriberResponse[];
    onClose: () => void;
}

type EntryLoad = { id: string; entry?: LedgerEntry; error?: string };

function Row({label, children}: { label: ReactNode; children: ReactNode }) {
    return (
        <div className="led-detail-row">
            <span className="led-detail-label">{label}</span>
            <span className="led-detail-value">{children}</span>
        </div>
    );
}

export function EntryDrawer({entryId, subscribers, onClose}: EntryDrawerProps) {
    const names = useSubscriberNames();
    const [load, setLoad] = useState<EntryLoad | null>(null);

    useEffect(() => {
        let active = true;
        const fetchEntry = async () => {
            try {
                const response = await apiFetch(`${API_CONFIG.LEDGER_URL}/entries/${entryId}`);
                const result: EntryLoad = response.ok
                    ? {id: entryId, entry: await response.json()}
                    : {id: entryId, error: await getResponseErrorMessage(response, 'Couldn’t load this entry.')};
                if (active) setLoad(result);
            } catch {
                if (active) setLoad({id: entryId, error: 'The server could not be reached.'});
            }
        };
        void fetchEntry();
        return () => {
            active = false;
        };
    }, [entryId]);

    const current = load?.id === entryId ? load : null;
    const entry = current?.entry;

    return (
        <Drawer open flush eyebrow="Ledger entry" title={entry ? `${names.full(entry.subscriberId, entry.subscriberName)} · ${entry.subscriptionServiceName}` : 'Ledger entry'}
                onClose={onClose}>
            {!current && <DrawerSection><span className="ui-skeleton-bar" style={{width: '60%'}}/></DrawerSection>}
            {current?.error && <DrawerSection><Notice tone="red">{current.error}</Notice></DrawerSection>}
            {entry && (
                <>
                    <DrawerSection title="Share">
                        <div className="led-detail-amount">{formatMoney(entry.amount)}</div>
                        <Row label="Month">{formatMonthLong(entry.recordedMonth)}</Row>
                        <Row label="Charge">
                            {formatMonthLong(entry.chargeMonth)} bill, {shareLabel(entry)}
                        </Row>
                        {entry.chargeDescription && <Row label="Charge notes">{entry.chargeDescription}</Row>}
                        <Row label="Invoice">
                            {entry.invoiceId
                                ? <Tag tone="green">Invoiced</Tag>
                                : <Tag tone="grey">Not invoiced yet</Tag>}
                        </Row>
                        {entry.notes && <Row label="Notes">{entry.notes}</Row>}
                    </DrawerSection>
                    <DrawerSection title="Cost run">
                        <Row label="Period">{formatPeriod(entry.calculationBatchFromMonth, entry.calculationBatchToMonth)}</Row>
                        <Row label="Calculated">{formatWhen(entry.calculatedAt)}</Row>
                        <Row label="By">{actorName(entry.generatedByAccountName, entry.generatedByAccountId, subscribers)}</Row>
                    </DrawerSection>
                    <DrawerSection title="IDs">
                        <Row label="Entry"><span className="led-id">{entry.id}</span></Row>
                        <Row label="Charge"><span className="led-id">{entry.chargeId}</span></Row>
                        <Row label="Run"><span className="led-id">{entry.calculationBatchId}</span></Row>
                        {entry.invoiceId && <Row label="Invoice"><span className="led-id">{entry.invoiceId}</span></Row>}
                        <Row label="Subscriber"><span className="led-id">{entry.subscriberId}</span></Row>
                    </DrawerSection>
                </>
            )}
        </Drawer>
    );
}
