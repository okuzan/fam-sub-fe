import {type ReactNode, useCallback, useRef, useState} from 'react';
import {Dialog} from './components';
import {ConfirmContext, type ConfirmOptions, type ConfirmResult} from './confirmContext';

export function ConfirmProvider({children}: { children: ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [reason, setReason] = useState('');
    const [showError, setShowError] = useState(false);
    const resolveRef = useRef<((result: ConfirmResult) => void) | null>(null);

    const confirm = useCallback((next: ConfirmOptions) => {
        resolveRef.current?.({confirmed: false, reason: ''});
        setOptions(next);
        setReason('');
        setShowError(false);
        return new Promise<ConfirmResult>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    const finish = (confirmed: boolean) => {
        if (confirmed && options?.reason?.required && !reason.trim()) {
            setShowError(true);
            return;
        }
        resolveRef.current?.({confirmed, reason: reason.trim()});
        resolveRef.current = null;
        setOptions(null);
    };

    const tone = options?.tone ?? 'primary';
    const confirmClass = tone === 'danger' ? 'is-danger' : tone === 'dark' ? 'is-dark' : 'is-primary';
    const blocked = Boolean(options?.reason?.required && !reason.trim());

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Dialog
                open={options !== null}
                title={options?.title}
                onClose={() => finish(false)}
                footer={
                    <>
                        <button type="button" className="ui-btn" onClick={() => finish(false)}>Cancel</button>
                        <button
                            type="button"
                            className={`ui-btn ${confirmClass}`}
                            aria-disabled={blocked}
                            style={blocked ? {opacity: 0.45} : undefined}
                            onClick={() => finish(true)}
                        >
                            {options?.confirmLabel}
                        </button>
                    </>
                }
            >
                {options?.text && <span className="ui-dialog-text">{options.text}</span>}
                {options?.reason && (
                    <div className={`ui-field ${showError && !reason.trim() ? 'has-error' : ''}`}>
                        <label className="ui-field-label" htmlFor="confirm-reason">{options.reason.label}</label>
                        <textarea
                            id="confirm-reason"
                            className="ui-textarea"
                            value={reason}
                            placeholder={options.reason.placeholder}
                            autoFocus
                            onChange={(event) => setReason(event.target.value)}
                        />
                        {showError && !reason.trim() && (
                            <span className="ui-field-error">{options.reason.requiredMessage ?? 'Add a reason.'}</span>
                        )}
                    </div>
                )}
            </Dialog>
        </ConfirmContext.Provider>
    );
}
