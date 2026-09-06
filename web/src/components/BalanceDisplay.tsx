import type { WalletBalances } from '../lib/walletAdapter';

interface Props {
  balances: WalletBalances | null;
  onRefresh: () => void;
}

function formatAmount(raw: bigint, decimals: number = 6): string {
  const whole = raw / BigInt(10 ** decimals);
  const frac = raw % BigInt(10 ** decimals);
  return `${whole}.${frac.toString().padStart(decimals, '0')}`;
}

export function BalanceDisplay({ balances, onRefresh }: Props) {
  if (!balances) return null;

  const usdmKey = Object.keys(balances.unshielded).find(
    (k) => k !== '0'.repeat(64),
  );
  const nightKey = '0'.repeat(64);
  const usdm = usdmKey ? balances.unshielded[usdmKey] ?? 0n : 0n;
  const night = balances.unshielded[nightKey] ?? 0n;

  return (
    <div className="card balances">
      <h3>Balances</h3>
      <table>
        <tbody>
          <tr>
            <td>NIGHT</td>
            <td className="mono">{formatAmount(night)}</td>
          </tr>
          <tr>
            <td>USDM</td>
            <td className="mono">{formatAmount(usdm)}</td>
          </tr>
        </tbody>
      </table>
      <button className="btn small" onClick={onRefresh}>
        Refresh
      </button>
    </div>
  );
}
