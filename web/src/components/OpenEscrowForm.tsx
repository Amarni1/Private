import { useState } from 'react';

interface Props {
  contractAddress: string | null;
  onOpen: (
    amount: bigint,
    releaseMinutes: number,
    refundHours: number,
  ) => Promise<{ preimage: number[] } | null>;
  deploying: boolean;
  calling: boolean;
  error: string | null;
}

export function OpenEscrowForm({ contractAddress, onOpen, deploying, calling, error }: Props) {
  const [amount, setAmount] = useState('5000000');
  const [releaseMin, setReleaseMin] = useState('60');
  const [refundHrs, setRefundHrs] = useState('168');

  const busy = deploying || calling;
  const label = deploying ? 'Deploying contract...' : calling ? 'Submitting escrow...' : 'Open Escrow';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await onOpen(
      BigInt(amount),
      Number(releaseMin),
      Number(refundHrs),
    );
    if (result) {
      const hex = Array.from(result.preimage)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      alert(
        `Escrow opened! Save this preimage (your release secret):\n\n${hex}`,
      );
    }
  };

  return (
    <div className="card">
      <h3>Open Escrow</h3>
      {!contractAddress && (
        <p className="hint">Contract will be deployed automatically on first submission.</p>
      )}
      {contractAddress && (
        <p className="hint">Contract deployed at <code>{contractAddress.slice(0, 16)}...</code></p>
      )}
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label>
          Amount (raw units, 6 decimals)
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Release deadline (minutes)
          <input
            type="number"
            value={releaseMin}
            onChange={(e) => setReleaseMin(e.target.value)}
          />
        </label>
        <label>
          Refund deadline (hours)
          <input
            type="number"
            value={refundHrs}
            onChange={(e) => setRefundHrs(e.target.value)}
          />
        </label>
        <button className="btn primary" type="submit" disabled={busy}>
          {label}
        </button>
      </form>
    </div>
  );
}
