import type {ReactNode} from 'react';
import type {ChargeResponse} from '../../../types/charge';
import type {InvoiceResponse} from '../../../types/invoice';
import type {LedgerEntry} from '../../../types/ledger';
import {formatInstantDate, formatMoney, formatMonthLong, plural} from '../../../ui/format';
import {sumAmounts} from './ledgerModel';

type StepState = 'done' | 'next' | 'waiting';

interface Step {
    name: string;
    state: StepState;
    note: ReactNode;
}

interface LedgerPipelineProps {
    month: string;
    /** Every charge; undefined while loading. */
    charges: ChargeResponse[] | undefined;
    /** Ledger entries recorded for the month; undefined while loading. */
    entries: LedgerEntry[] | undefined;
    /** Every invoice; undefined while loading, null when they could not be read. */
    invoices: InvoiceResponse[] | null | undefined;
    action?: ReactNode;
}

const STATE_LABEL: Record<StepState, string> = {done: 'Done', next: 'Next', waiting: 'Waiting'};

/**
 * Where one month stands: charges → cost calculation → invoices → email → paid.
 * Each step is worked out from real data; a step that cannot be judged yet stays
 * Waiting and says why.
 */
function buildSteps(month: string, charges: ChargeResponse[], entries: LedgerEntry[], invoices: InvoiceResponse[] | null): Step[] {
    const monthCharges = charges.filter((charge) => charge.chargeMonth === month);
    const calculatedIds = new Set(entries.map((entry) => entry.chargeId));
    const uncalculated = monthCharges.filter((charge) => !calculatedIds.has(charge.id));
    const uninvoiced = entries.filter((entry) => !entry.invoiceId);
    const invoiceIds = new Set(entries.flatMap((entry) => (entry.invoiceId ? [entry.invoiceId] : [])));
    const monthInvoices = invoices?.filter((invoice) => invoiceIds.has(invoice.id) && invoice.status !== 'VOID') ?? [];
    const drafts = monthInvoices.filter((invoice) => invoice.status === 'DRAFT');
    const paid = monthInvoices.filter((invoice) => invoice.status === 'PAID');

    const chargesStep: Step = monthCharges.length > 0
        ? {
            name: 'Charges',
            state: 'done',
            note: `${plural(monthCharges.length, 'bill')} · ${formatMoney(sumAmounts(monthCharges.map((charge) => charge.amount)))}`
        }
        : {name: 'Charges', state: 'next', note: 'No bills added for this month yet'};

    let costStep: Step;
    if (monthCharges.length === 0 && entries.length === 0) {
        costStep = {name: 'Cost calculation', state: 'waiting', note: 'Needs the month’s charges first'};
    } else if (uncalculated.length === 0) {
        const latest = entries.reduce((max, entry) => (entry.calculatedAt > max ? entry.calculatedAt : max), '');
        costStep = {
            name: 'Cost calculation',
            state: 'done',
            note: `${plural(entries.length, 'entry', 'entries')} · ${formatInstantDate(latest)}`
        };
    } else {
        costStep = {
            name: 'Cost calculation',
            state: 'next',
            note: entries.length === 0
                ? `${plural(monthCharges.length, 'charge')} to split`
                : `${uncalculated.length} of ${plural(monthCharges.length, 'charge')} not split yet`
        };
    }

    let invoiceStep: Step;
    if (entries.length > 0 && uninvoiced.length === 0) {
        invoiceStep = {name: 'Generate invoices', state: 'done', note: plural(invoiceIds.size, 'invoice')};
    } else if (costStep.state === 'done') {
        invoiceStep = {
            name: 'Generate invoices',
            state: 'next',
            note: invoiceIds.size > 0
                ? `${plural(uninvoiced.length, 'entry', 'entries')} not invoiced yet`
                : `${plural(entries.length, 'entry', 'entries')} to invoice`
        };
    } else {
        invoiceStep = {name: 'Generate invoices', state: 'waiting', note: 'After the cost calculation'};
    }

    let emailStep: Step;
    let paidStep: Step;
    if (invoiceStep.state !== 'done') {
        emailStep = {name: 'Email invoices', state: 'waiting', note: 'Drafts become sent'};
        paidStep = {name: 'Paid', state: 'waiting', note: 'Mostly from the bank'};
    } else if (invoices === null) {
        emailStep = {name: 'Email invoices', state: 'waiting', note: 'Couldn’t read invoices'};
        paidStep = {name: 'Paid', state: 'waiting', note: 'Couldn’t read invoices'};
    } else {
        emailStep = drafts.length === 0
            ? {name: 'Email invoices', state: 'done', note: `${plural(monthInvoices.length, 'invoice')} out`}
            : {name: 'Email invoices', state: 'next', note: `${plural(drafts.length, 'draft')} to send`};
        if (emailStep.state !== 'done') {
            paidStep = {name: 'Paid', state: 'waiting', note: `${paid.length} of ${monthInvoices.length} paid so far`};
        } else if (paid.length === monthInvoices.length) {
            paidStep = {name: 'Paid', state: 'done', note: 'Every invoice is paid'};
        } else {
            paidStep = {name: 'Paid', state: 'next', note: `${paid.length} of ${monthInvoices.length} paid`};
        }
    }

    return [chargesStep, costStep, invoiceStep, emailStep, paidStep];
}

export default function LedgerPipeline({month, charges, entries, invoices, action}: LedgerPipelineProps) {
    const ready = charges !== undefined && entries !== undefined && invoices !== undefined;
    const steps = ready ? buildSteps(month, charges, entries, invoices) : null;
    return (
        <section className="led-pipeline" aria-label={`${formatMonthLong(month)} · where it stands`}>
            <div className="led-pipeline-head">
                <span className="led-pipeline-title">{formatMonthLong(month)} · where it stands</span>
                {action}
            </div>
            <ol className="led-steps">
                {steps
                    ? steps.map((step) => (
                        <li key={step.name} className={`led-step is-${step.state}`}>
                            <span className="led-step-bar"/>
                            <span className="led-step-state">{STATE_LABEL[step.state]}</span>
                            <span className="led-step-name">{step.name}</span>
                            <span className="led-step-note">{step.note}</span>
                        </li>
                    ))
                    : ['Charges', 'Cost calculation', 'Generate invoices', 'Email invoices', 'Paid'].map((name) => (
                        <li key={name} className="led-step is-waiting" aria-busy="true">
                            <span className="led-step-bar"/>
                            <span className="led-step-state">&nbsp;</span>
                            <span className="led-step-name">{name}</span>
                            <span className="ui-skeleton-bar led-step-skeleton"/>
                        </li>
                    ))}
            </ol>
        </section>
    );
}
