import {type ReactNode, useCallback, useRef, useState} from 'react';
import {Dialog} from './components';
import {ConfirmContext, type ConfirmOptions, type ConfirmResult} from './confirmContext';

export function ConfirmProvider({children}: { children: ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [reason, setReason] = useState('');
    const [showError, setShowError] = useState(false);
    const [choice, setChoice] = useState('');
    const resolveRef = useRef<((result: ConfirmResult) => void) | null>(null);

    const confirm = useCallback((next: ConfirmOptions) => {
        resolveRef.current?.({confirmed: false, reason: '', choice: ''});
        setOptions(next);
        setReason('');
        setChoice(next.choice?.initial ?? '');
        setShowError(false);
        return new Promise<ConfirmResult>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    const finish = (confirmed: boolean) => {
        if (confirmed && options?.choice && !choice) {
            setShowError(true);
            return;
        }
        if (confirmed && options?.reason?.required && !reason.trim()) {
            setShowError(true);
            return;
        }
        resolveRef.current?.({confirmed, reason: reason.trim(), choice});
        resolveRef.current = null;
        setOptions(null);
    };

    const tone = options?.tone ?? 'primary';
    const confirmClass = tone === 'danger' ? 'is-danger' : tone === 'dark' ? 'is-dark' : 'is-primary';
    const blocked = Boolean((options?.reason?.required && !reason.trim()) || (options?.choice && !choice));
    const picked = options?.choice?.options.find((option) => option.value === choice);

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
                            {picked?.confirmLabel ?? options?.confirmLabel}
                        </button>
                    </>
                }
            >
                {options?.text && <span className="ui-dialog-text">{options.text}</span>}
                {options?.choice && (
                    <fieldset className="ui-choice-list">
                        <legend className="ui-field-label">{options.choice.label}</legend>
                        {options.choice.options.map((option) => (
                            <label key={option.value}
                                   className={`ui-choice ${option.value === choice ? 'is-active' : ''}`}>
                                <input type="radio" name="confirm-choice" value={option.value}
                                       checked={option.value === choice}
                                       onChange={() => setChoice(option.value)}/>
                                <span className="ui-choice-body">
                                    <span className="ui-choice-label">{option.label}</span>
                                    {option.hint && <span className="ui-choice-hint">{option.hint}</span>}
                                </span>
                            </label>
                        ))}
                        {showError && !choice && <span className="ui-field-error">Pick one to go ahead.</span>}
                    </fieldset>
                )}
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
