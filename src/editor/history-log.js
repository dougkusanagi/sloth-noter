import { Transaction } from '@codemirror/state'
import { fromTransaction } from '../history.js'
export function transactionHistory(transactions, before, after) {
  return transactions
    .filter((tr) => tr.docChanged)
    .map((tr) => ({
      before:
        transactions.length === 1 && before !== undefined ? before : tr.startState.doc.toString(),
      after: transactions.length === 1 && after !== undefined ? after : tr.newDoc.toString(),
      changes: fromTransaction(tr),
      origin: tr.annotation(Transaction.userEvent) ?? 'sistema',
    }))
}
