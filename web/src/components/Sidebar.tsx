import { useState } from 'react';
import type { WalletState } from '../hooks/useWallet';
import type { WalletBalances } from '../lib/walletAdapter';
import type { ContractState } from '../hooks/useContract';

export type View = 'open' | 'escrows' | 'history';

interface Props {
  wallet: WalletState;
  contract: ContractState;
  balances: WalletBalances | null;
  onConnect: (network?: string) => void;
  onRefreshBalances: () => void;
  activeView: View;
  onViewChange: (view: View) => void;
  escrowCount: number;
}

function formatAmount(raw: bigint, decimals: number = 6): string {
  const whole = raw / BigInt(10 ** decimals);
  const frac = raw % BigInt(10 ** decimals);
  return `${whole}.${frac.toString().padStart(decimals, '0')}`;
}

export function Sidebar({
  wallet,
  contract,
  balances,
  onConnect,
  onRefreshBalances,
  activeView,
  onViewChange,
  escrowCount,
}: Props) {
  const isConnected = wallet.status === 'connected';

  const usdmKey = balances ? Object.keys(balances.unshielded).find((k) => k !== '0'.repeat(64)) : undefined;
  const nightKey = '0'.repeat(64);
  const usdm = usdmKey ? balances?.unshielded[usdmKey] ?? 0n : 0n;
  const night = balances?.unshielded[nightKey] ?? 0n;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h2>USDM Escrow</h2>
      </div>

      {!isConnected ? (
        <div className="sidebar-section">
          <button className="btn primary full-width" onClick={() => onConnect('preview')}>
            Connect Lace Wallet
          </button>
          <p className="hint" style={{ marginTop: '0.5rem' }}>
            Requires the{' '}
            <a href="https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk" target="_blank" rel="noopener">
              Lace
            </a>{' '}
            extension
          </p>
        </div>
      ) : (
        <>
          <div className="sidebar-section">
            <div className="badge green">Connected</div>
            <p className="sidebar-addr" title={wallet.addresses?.shieldedAddress}>
              {wallet.addresses?.shieldedAddress.slice(0, 18)}...
            </p>
          </div>

          <div className="sidebar-section balances-sidebar">
            <div className="balance-row">
              <span>NIGHT</span>
              <span className="mono">{formatAmount(night)}</span>
            </div>
            <div className="balance-row">
              <span>USDM</span>
              <span className="mono">{formatAmount(usdm)}</span>
            </div>
            <button className="btn small" onClick={onRefreshBalances}>
              Refresh
            </button>
          </div>

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeView === 'open' ? 'active' : ''}`}
              onClick={() => onViewChange('open')}
            >
              Open Escrow
            </button>
            <button
              className={`nav-item ${activeView === 'escrows' ? 'active' : ''}`}
              onClick={() => onViewChange('escrows')}
            >
              Active Escrows
              {escrowCount > 0 && <span className="nav-badge">{escrowCount}</span>}
            </button>
            <button
              className={`nav-item ${activeView === 'history' ? 'active' : ''}`}
              onClick={() => onViewChange('history')}
            >
              Transaction History
            </button>
          </nav>

          {contract.deploying && (
            <div className="sidebar-status">
              <span className="spinner" /> Deploying contract...
            </div>
          )}
          {contract.calling && (
            <div className="sidebar-status">
              <span className="spinner" /> Submitting transaction...
            </div>
          )}
          {contract.error && (
            <div className="sidebar-error">{contract.error}</div>
          )}
        </>
      )}
    </aside>
  );
}
