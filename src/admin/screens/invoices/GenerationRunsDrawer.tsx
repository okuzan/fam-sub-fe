import {useCallback, useEffect, useState} from 'react';
import {useToast} from '../../../components/ToastContext';
import {API_CONFIG} from '../../../config/api';
import {Drawer, EmptyState, Money, TableSkeleton, Tag} from '../../../ui/components';
import {useConfirm} from '../../../ui/confirmContext';
import {formatMonthLong, formatPeriod, formatWhen, plural} from '../../../ui/format';
import type {AdminActionResponse, RunRecoveryPreviewResponse, RunUndoRequest, RunUndoResponse} from '../../../types/adminAction';
import {getJson, sendJson} from './invoiceUtils';

const RUN_LIMIT = 50;

const runPeriod = (run: AdminActionResponse) => {
    if (!run.fromMonth || !run.toMonth) return 'Invoice run';
    return run.fromMonth === run.toMonth ? formatMonthLong(run.fromMonth) : formatPeriod(run.fromMonth, run.toMonth);
};

const fetchRuns = () => getJson<AdminActionResponse[]>(
    `${API_CONFIG.ADMIN_ACTIONS_URL}/invoice-runs?limit=${RUN_LIMIT}`,
    'Could not load the invoice runs.'
);

const metric = (run: AdminActionResponse, key: string) => run.metrics?.[key] ?? null;

interface GenerationRunsDrawerProps {
    onClose: () => void;
    /** A run was undone: its invoices are gone, refetch. */
    onChanged: () => void;
}

/** Every invoice generation run, newest first, each one undoable while all its invoices are still drafts. */
export default function GenerationRunsDrawer({onClose, onChanged}: GenerationRunsDrawerProps) {
    const {showSuccess, showError} = useToast();
    const confirm = useConfirm();
    const [runs, setRuns] = useState<AdminActionResponse[] | null>(null);
    const [busyRunId, setBusyRunId] = useState<string | null>(null);

    const applyRuns = useCallback((result: { data: AdminActionResponse[] } | { error: string }) => {
        if ('error' in result) showError(result.error);
        setRuns('data' in result && Array.isArray(result.data) ? result.data : []);
    }, [showError]);

    const load = useCallback(async () => applyRuns(await fetchRuns()), [applyRuns]);

    useEffect(() => {
        let active = true;
        fetchRuns().then((result) => {
            if (active) applyRuns(result);
        });
        return () => {
            active = false;
        };
    }, [applyRuns]);

    const handleUndo = async (run: AdminActionResponse) => {
        const runId = run.targetId ?? run.id;
        const period = runPeriod(run);
        setBusyRunId(runId);
        const preview = await getJson<RunRecoveryPreviewResponse>(
            `${API_CONFIG.ADMIN_RECOVERY_URL}/invoice-runs/${runId}/preview`,
            'Could not check whether this run can be undone.'
        );
        setBusyRunId(null);
        if ('error' in preview) {
            showError(`Couldn’t check the ${period} run`, preview.error);
            return;
        }
        const {allowed, alreadyUndone, blockers, effects} = preview.data;
        if (alreadyUndone) {
            showError(`The ${period} run is already undone`);
            await load();
            return;
        }
        if (!allowed) {
            const notDraft = blockers.filter((blocker) => blocker.startsWith('Invoice ')).length;
            showError(
                `The ${period} run can’t be undone`,
                notDraft > 0
                    ? `${plural(notDraft, 'invoice')} from it ${notDraft === 1 ? 'is' : 'are'} no longer a draft. Void those one by one instead.`
                    : blockers.join('; ')
            );
            return;
        }

        const invoicesDeleted = Number(effects.invoicesDeleted ?? 0);
        const entriesReleased = Number(effects.ledgerEntriesReleased ?? 0);
        const {confirmed, reason} = await confirm({
            title: `Undo the ${period} invoice run?`,
            text: `Deletes its ${plural(invoicesDeleted, 'draft invoice')} and returns ${plural(entriesReleased, 'ledger entry', 'ledger entries')} to the uninvoiced pool. You can generate the period again afterwards.`,
            confirmLabel: 'Undo run',
            tone: 'dark',
            reason: {label: 'Reason', placeholder: 'Optional, for the activity log'},
        });
        if (!confirmed) return;

        setBusyRunId(runId);
        const body: RunUndoRequest = {reason: reason.trim() || undefined};
        const result = await sendJson<RunUndoResponse>(
            `${API_CONFIG.ADMIN_RECOVERY_URL}/invoice-runs/${runId}/undo`,
            'POST',
            body,
            'The run could not be undone.'
        );
        setBusyRunId(null);
        if ('error' in result) {
            showError(`Couldn’t undo the ${period} run`, result.error);
            return;
        }
        const done = result.data?.effects ?? effects;
        showSuccess(
            `${period} invoice run undone`,
            `${plural(Number(done.invoicesDeleted ?? 0), 'invoice')} deleted · ${plural(Number(done.ledgerEntriesReleased ?? 0), 'entry', 'entries')} released`
        );
        onChanged();
        await load();
    };

    return (
        <Drawer open wide flush title="Generation runs" eyebrow="Invoices" onClose={onClose}>
            {runs === null ? (
                <div className="ui-drawer-section"><TableSkeleton columns="1fr 90px" rows={5}/></div>
            ) : runs.length === 0 ? (
                <div className="ui-drawer-section">
                    <EmptyState title="No generation runs yet">
                        Each “Generate for period” creates a run you can undo here while its invoices are drafts.
                    </EmptyState>
                </div>
            ) : (
                runs.map((run) => {
                    const runId = run.targetId ?? run.id;
                    const undoneAt = metric(run, 'undoneAt');
                    const undoReason = metric(run, 'undoReason');
                    const invoices = Number(metric(run, 'invoicesCreated') ?? 0);
                    const entries = Number(metric(run, 'ledgerEntriesAssigned') ?? 0);
                    return (
                        <section key={run.id} className={`ui-drawer-section inv-run ${undoneAt ? 'is-undone' : ''}`}>
                            <div className="inv-run-head">
                                <span className="inv-run-title">{runPeriod(run)}</span>
                                {undoneAt
                                    ? <Tag tone="grey">Undone</Tag>
                                    : <Money value={Number(metric(run, 'totalAmount') ?? 0)}/>}
                            </div>
                            <span className="inv-drawer-meta">
                                Run {formatWhen(run.createdAt)} · {plural(invoices, 'invoice')} · {plural(entries, 'entry', 'entries')}
                                {metric(run, 'sendEmail') ? ' · emailed' : ''}
                                {run.subscriberId ? ' · one subscriber' : ''}
                            </span>
                            {undoneAt ? (
                                <span className="inv-drawer-hint">
                                    Undone {formatWhen(String(undoneAt))}{undoReason ? ` · ${String(undoReason)}` : ''}
                                </span>
                            ) : (
                                <div>
                                    <button
                                        type="button"
                                        className="ui-btn is-small"
                                        onClick={() => handleUndo(run)}
                                        disabled={busyRunId !== null}
                                    >
                                        {busyRunId === runId ? 'Checking…' : 'Undo run'}
                                    </button>
                                </div>
                            )}
                        </section>
                    );
                })
            )}
        </Drawer>
    );
}
