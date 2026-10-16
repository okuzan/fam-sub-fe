import {type ReactNode, useEffect} from 'react';
import {createPortal} from 'react-dom';
import {useEscapeClose} from '../utils/useEscapeClose';
import {formatMoney} from './format';
import './ui.css';

export type Tone = 'red' | 'clay' | 'green' | 'slate' | 'grey' | 'dark';

export function Tag({tone, children}: { tone: Tone; children: ReactNode }) {
    return <span className={`ui-tag tone-${tone}`}>{children}</span>;
}

export function Dot({tone}: { tone: Tone }) {
    return <span className={`ui-dot tone-${tone}`} aria-hidden="true"/>;
}

export function Money({value, className = ''}: { value: number | string | null | undefined; className?: string }) {
    return <span className={`ui-money ${className}`}>{formatMoney(value)}</span>;
}

interface PageHeaderProps {
    eyebrow?: ReactNode;
    title: ReactNode;
    lead?: ReactNode;
    actions?: ReactNode;
    /** Bottom rule and a larger title, as on Overview and Finance. */
    ruled?: boolean;
}

export function PageHeader({eyebrow, title, lead, actions, ruled = false}: PageHeaderProps) {
    return (
        <header className={`ui-page-header ${ruled ? 'has-rule' : ''}`}>
            <div className="ui-page-header-text">
                {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
                <h1 className={`ui-page-title ${ruled ? 'is-large' : ''}`}>{title}</h1>
                {lead && <p className="ui-page-lead">{lead}</p>}
            </div>
            {actions && <div className="ui-page-actions">{actions}</div>}
        </header>
    );
}

export interface StatItem {
    label: ReactNode;
    value: ReactNode;
    note?: ReactNode;
    tone?: 'red' | 'green';
    /** The failing-sync look of the Bank read tile. */
    alert?: boolean;
    href?: string;
    onClick?: () => void;
}

export function StatStrip({items}: { items: StatItem[] }) {
    return (
        <div className="ui-stat-strip">
            {items.map((item, index) => {
                const content = (
                    <>
                        <span className="ui-label">
                            {item.alert && <Dot tone="red"/>}
                            {item.label}
                        </span>
                        <span className={`ui-stat-value ${item.tone ? `is-${item.tone}` : ''}`}>{item.value}</span>
                        {item.note && <span className="ui-stat-note">{item.note}</span>}
                    </>
                );
                const className = `ui-stat ${item.alert ? 'is-alert' : ''}`;
                if (item.href) return <a key={index} className={className} href={item.href}>{content}</a>;
                if (item.onClick) {
                    return (
                        <button key={index} type="button" className={className} onClick={item.onClick}
                                style={{border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit'}}>
                            {content}
                        </button>
                    );
                }
                return <div key={index} className={className}>{content}</div>;
            })}
        </div>
    );
}

export interface SegmentOption<T extends string> {
    value: T;
    label: ReactNode;
    count?: number;
}

/** Pill group filter: "All 159 | Draft 6 | Sent 26". */
export function Segmented<T extends string>({options, value, onChange, ariaLabel}: {
    options: SegmentOption<T>[];
    value: T;
    onChange: (value: T) => void;
    ariaLabel?: string;
}) {
    return (
        <div className="ui-segmented" role="tablist" aria-label={ariaLabel}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={option.value === value}
                    className={option.value === value ? 'is-active' : ''}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                    {option.count !== undefined && <span className="ui-seg-count">{option.count}</span>}
                </button>
            ))}
        </div>
    );
}

/** Underlined tabs: "Needs review 3 | Applied 141". */
export function Tabs<T extends string>({options, value, onChange, alertValue}: {
    options: SegmentOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /** The tab whose count shows as a red badge. */
    alertValue?: T;
}) {
    return (
        <div className="ui-tabs" role="tablist">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={option.value === value}
                    className={option.value === value ? 'is-active' : ''}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                    {option.count !== undefined && (
                        <span className={`ui-tab-count ${option.value === alertValue && option.count > 0 ? 'is-alert' : ''}`}>
                            {option.count}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}

interface FieldProps {
    label: ReactNode;
    optional?: boolean;
    hint?: ReactNode;
    error?: ReactNode;
    children: ReactNode;
    htmlFor?: string;
}

export function Field({label, optional, hint, error, children, htmlFor}: FieldProps) {
    return (
        <div className={`ui-field ${error ? 'has-error' : ''}`}>
            <label className="ui-field-label" htmlFor={htmlFor}>
                {label}
                {optional && <span className="ui-field-optional"> · optional</span>}
            </label>
            {children}
            {error ? <span className="ui-field-error">{error}</span> : hint && <span className="ui-field-hint">{hint}</span>}
        </div>
    );
}

interface DrawerProps {
    open: boolean;
    title: ReactNode;
    /** Small text above the title, e.g. a short id. */
    eyebrow?: ReactNode;
    onClose: () => void;
    footer?: ReactNode;
    children: ReactNode;
    wide?: boolean;
    /** Sections bring their own padding (detail drawers). */
    flush?: boolean;
}

/** The right-side panel used for every add/edit form and every detail view. */
export function Drawer({open, title, eyebrow, onClose, footer, children, wide = false, flush = false}: DrawerProps) {
    useEscapeClose(open, onClose);
    if (!open) return null;
    return createPortal(
        <>
            <div className="ui-drawer-backdrop" onClick={onClose}/>
            <aside className={`ui-drawer ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true">
                <div className="ui-drawer-head">
                    <div style={{display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0}}>
                        {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
                        <span className="ui-drawer-title">{title}</span>
                    </div>
                    <button type="button" className="ui-drawer-close" onClick={onClose} aria-label="Close">×</button>
                </div>
                <div className={`ui-drawer-body ${flush ? 'is-flush' : ''}`}>{children}</div>
                {footer && <div className="ui-drawer-foot">{footer}</div>}
            </aside>
        </>,
        document.body
    );
}

export function DrawerSection({title, children}: { title?: ReactNode; children: ReactNode }) {
    return (
        <section className="ui-drawer-section">
            {title && <span className="ui-label">{title}</span>}
            {children}
        </section>
    );
}

interface DialogProps {
    open: boolean;
    title: ReactNode;
    children?: ReactNode;
    onClose: () => void;
    footer: ReactNode;
}

export function Dialog({open, title, children, onClose, footer}: DialogProps) {
    useEscapeClose(open, onClose);
    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [open]);
    if (!open) return null;
    return createPortal(
        <div className="ui-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div className="ui-dialog" role="alertdialog" aria-modal="true">
                <div className="ui-dialog-body">
                    <span className="ui-dialog-title">{title}</span>
                    {children}
                </div>
                <div className="ui-dialog-foot">{footer}</div>
            </div>
        </div>,
        document.body
    );
}

export function EmptyState({title, children, action}: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
    return (
        <div className="ui-empty">
            <span className="ui-empty-title">{title}</span>
            {children && <span className="ui-empty-text">{children}</span>}
            {action && <div style={{marginTop: 6}}>{action}</div>}
        </div>
    );
}

/** Grey bars in the shape of the table that is loading. */
export function TableSkeleton({columns = '1fr 90px 70px 90px', rows = 6}: { columns?: string; rows?: number }) {
    const widths = ['70%', '55%', '82%', '62%', '48%', '75%', '58%'];
    const columnCount = columns.split(' ').length;
    return (
        <div aria-busy="true" aria-label="Loading">
            {Array.from({length: rows}, (_, row) => (
                <div key={row} className="ui-skeleton-row" style={{gridTemplateColumns: columns}}>
                    {Array.from({length: columnCount}, (_, column) => (
                        <span
                            key={column}
                            className="ui-skeleton-bar"
                            style={{
                                width: widths[(row + column) % widths.length],
                                justifySelf: column === columnCount - 1 ? 'end' : 'start'
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function Notice({tone = 'grey', children}: { tone?: 'red' | 'clay' | 'green' | 'grey'; children: ReactNode }) {
    return <div className={`ui-notice tone-${tone}`}>{children}</div>;
}

export function Brand({href = '/', label = 'FamSub'}: { href?: string; label?: ReactNode }) {
    return (
        <a className="ui-brand" href={href}>
            <img src="/favicon.svg" alt="" width={18} height={18}/>
            {label}
        </a>
    );
}
