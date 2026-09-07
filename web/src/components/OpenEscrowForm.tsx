import { useState } from 'react';
import type { WalletBalances } from '../lib/walletAdapter';

interface Props {
  contractAddress: string | null;
  balances: WalletBalances | null;
  onOpen: (
    amount: bigint,
    releaseMinutes: number,
    refundHours: number,
    tokenColorHex: string,
  ) => Promise<{ preimage: number[] } | null>;
  deploying: boolean;
  calling: boolean;
  error: string | null;
}

export function OpenEscrowForm({ contractAddress, balances, onOpen, deploying, calling, error }: Props) {
  const [amount, setAmount] = useState('5000000');
  const [releaseMin, setReleaseMin] = useState('60');
  const [refundHrs, setRefundHrs] = useState('168');
  const [tokenColor, setTokenColor] = useState('');

  const busy = deploying || calling;
  const label = deploying ? 'Deploying contract...' : calling ? 'Submitting escrow...' : 'Open Escrow';

  const availableTokens = balances
    ? [
        ...new Set([
          ...Object.keys(balances.unshielded),
          ...Object.keys(balances.shielded),
        ]),
      ].filter((k) => k !== '0'.repeat(64))
    : [];

  const suggestedColor = availableTokens[0] ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const color = tokenColor || suggestedColor;
    if (!color) {
      alert('No USDM token color found. Enter the USDM color hex manually.');
      return;
    }
    const result = await onOpen(
      BigInt(amount),
      Number(releaseMin),
      Number(refundHrs),
      color,
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
        <p className="hint">Contract at <code>{contractAddress.slice(0, 16)}...</code></p>
      )}
      {availableTokens.length > 0 && (
        <div className="hint" style={{ marginBottom: '0.75rem' }}>
          Wallet tokens: {availableTokens.map((t) => t.slice(0, 16) + '...').join(', ')}
        </div>
      )}
      {availableTokens.length === 0 && (
        <div className="error" style={{ marginBottom: '0.75rem' }}>
          No non-DUST tokens found in wallet. You need USDM to open an escrow.
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label>
          USDM Token Color (hex)
          <input
            type="text"
            value={tokenColor}
            onChange={(e) => setTokenColor(e.target.value)}
            placeholder={suggestedColor ? `Auto-detected: ${suggestedColor.slice(0, 16)}...` : 'Enter USDM color hex'}
          />
        </label>
        <label>
          Amount (raw units, 6 decimals = 1.00 USDM)
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
        <button className="btn primary" type="submit" disabled={busy || !suggestedColor && !tokenColor}>
          {label}
        </button>
      </form>
    </div>
  );
}
