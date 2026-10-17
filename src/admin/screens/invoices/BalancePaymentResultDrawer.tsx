import {Drawer, Money, Tag} from '../../../ui/components';
import {formatMoney, plural} from '../../../ui/format';
import type {InvoiceBulkBalancePaymentItemResult, InvoiceBulkBalancePaymentResult} from '../../../types/invoice';
import {useSubscriberNames} from '../../subscriberNames';

const outcome = (item: InvoiceBulkBalancePaymentItemResult) => {
    if (item.paid) return <Tag tone="green">Paid</Tag>;
    if (item.skipped) return <Tag tone="grey">Skipped</Tag>;
    return <Tag tone="red">Failed</Tag>;
};

/** What "Pay drafts from balance" did, draft by draft. */
export default function BalancePaymentResultDrawer({result, onClose}: {
    result: InvoiceBulkBalancePaymentResult;
    onClose: () => void;
}) {
    const names = useSubscriberNames();
    return (
        <Drawer
            open
            wide
            title="Drafts paid from balance"
            eyebrow="Invoices"
            onClose={onClose}
            footer={<button type="button" className="ui-btn" onClick={onClose}>Close</button>}
        >
            <p className="inv-form-lead">
                Paid {result.paidCount} of {plural(result.attemptedCount, 'draft')} for {formatMoney(result.totalPaidAmount)}.
                {result.skippedCount > 0 && ` ${result.skippedCount} skipped because the balance didn’t cover them.`}
                {result.failedCount > 0 && ` ${result.failedCount} failed.`}
            </p>
            {result.items.length > 0 && (
                <div className="ui-table-wrap">
                    <table className="ui-table">
                        <thead>
                        <tr>
                            <th>Subscriber</th>
                            <th className="is-num">Invoice</th>
                            <th className="is-num">Balance after</th>
                            <th>Result</th>
                        </tr>
                        </thead>
                        <tbody>
                        {result.items.map((item) => (
                            <tr key={item.invoiceId}>
                                <td>
                                    <span className="is-strong">{names.short(item.subscriberId, item.subscriberName)}</span>
                                    {item.message && <span className="ui-cell-sub">{item.message}</span>}
                                </td>
                                <td className="is-num"><Money value={item.invoiceAmount}/></td>
                                <td className="is-num">
                                    <Money value={item.balanceAfter}/>
                                    <span className="ui-cell-sub is-mono">was {formatMoney(item.balanceBefore)}</span>
                                </td>
                                <td>{outcome(item)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Drawer>
    );
}
