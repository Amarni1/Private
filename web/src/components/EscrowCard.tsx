import { useState } from 'react';
import type { Escrow } from '../hooks/useEscrows';
import { statusLabel } from '../hooks/useEscrows';

interface Props {
  escrow: Escrow;
  onRelease: (escrowId: bigint, preimage: Uint8Array, recipient: string) => Promise<void>;
  onRefund: (escrowId: bigint) => Promise<void>;
  calling: boolean;
}

export function EscrowCard({ escrow, onRelease, onRefund, calling }: Props) {
  const [preimageHex, setPreimageHex] = useState('');
  const [recipient, setRecipient] = useState('');
  const [mode, setMode] = useState<'view' | 'release' | 'refund'>('view');

  const status = statusLabel(escrow.status);
  const isOpen = (escrow.status as number) === 0;
  const now = Math.floor(Date.now() / 1000);
  const canRelease = isOpen && now < Number(escrow.releaseDeadline);
  const canRefund = isOpen && now >= Number(escrow.refundDeadline);

  const handleRelease = async () => {
    const bytes = Uint8Array.from(
      preimageHex.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) ?? [],
    );
    if (bytes.length !== 32) {
      alert('Preimage must be 32 bytes (64 hex chars)');
      return;
    }
    await onRelease(escrow.id, bytes, recipient || '0'.repeat(64));
    setMode('view');
  };

  return (
    <div className={`card escrow ${status.toLowerCase()}`}>
      <div className="escrow-header">
        <h3>Escrow #{escrow.id.toString()}</h3>
        <div className={`badge ${status.toLowerCase()}`}>{status}</div>
      </div>
      <table className="escrow-details">
        <tbody>
          <tr>
            <td>Amount</td>
            <td className="mono">{(Number(escrow.amount) / 1e6).toFixed(6)} USDM</td>
          </tr>
          <tr>
            <td>Release deadline</td>
            <td className="mono">
              {new Date(Number(escrow.releaseDeadline) * 1000).toLocaleString()}
            </td>
          </tr>
          <tr>
            <td>Refund deadline</td>
            <td className="mono">
              {new Date(Number(escrow.refundDeadline) * 1000).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>

      {mode === 'view' && (
        <div className="escrow-actions">
          {canRelease && (
            <button className="btn small" onClick={() => setMode('release')}>
              Release
            </button>
          )}
          {canRefund && (
            <button className="btn small danger" onClick={() => setMode('refund')}>
              Refund
            </button>
          )}
          {!canRelease && !canRefund && (
            <span className="hint">
              {isOpen ? 'Waiting for deadline...' : 'No actions available'}
            </span>
          )}
        </div>
      )}

      {mode === 'release' && (
        <div className="escrow-form">
          <label>
            Preimage (hex)
            <input
              type="text"
              placeholder="64 hex chars"
              value={preimageHex}
              onChange={(e) => setPreimageHex(e.target.value)}
            />
          </label>
          <label>
            Recipient (hex, optional)
            <input
              type="text"
              placeholder="defaults to your address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <div className="btn-group">
            <button className="btn small primary" onClick={handleRelease} disabled={calling}>
              {calling ? 'Proving...' : 'Submit Release'}
            </button>
            <button className="btn small" onClick={() => setMode('view')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'refund' && (
        <div className="escrow-form">
          <p>Refund USDM back to the depositor?</p>
          <div className="btn-group">
            <button
              className="btn small danger"
              onClick={async () => {
                await onRefund(escrow.id);
                setMode('view');
              }}
              disabled={calling}
            >
              {calling ? 'Proving...' : 'Confirm Refund'}
            </button>
            <button className="btn small" onClick={() => setMode('view')}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
