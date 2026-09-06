import type { TxEntry } from '../hooks/useTransactionHistory';

interface Props {
  entries: TxEntry[];
  onClear: () => void;
}

const TYPE_LABELS: Record<TxEntry['type'], string> = {
  deploy: 'Deploy',
  open: 'Open Escrow',
  release: 'Release',
  refund: 'Refund',
};

const STATUS_COLORS: Record<TxEntry['status'], string> = {
  submitted: 'var(--yellow)',
  confirmed: 'var(--green)',
  failed: 'var(--red)',
};

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function TransactionHistory({ entries, onClear }: Props) {
  return (
    <div className="card">
      <div className="tx-header">
        <h3>Transaction History</h3>
        {entries.length > 0 && (
          <button className="btn small" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="hint">No transactions yet.</p>
      ) : (
        <table className="tx-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Detail</th>
              <th>Tx Hash</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="mono">{formatTime(e.timestamp)}</td>
                <td>{TYPE_LABELS[e.type]}</td>
                <td className="mono">{e.detail}</td>
                <td className="mono" title={e.txHash}>
                  {truncateHash(e.txHash)}
                </td>
                <td>
                  <span
                    className="status-dot"
                    style={{ background: STATUS_COLORS[e.status] }}
                  />
                  {e.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
