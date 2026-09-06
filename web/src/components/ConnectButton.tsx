import type { WalletState } from '../hooks/useWallet';

interface Props {
  wallet: WalletState;
  onConnect: (network?: string) => void;
}

export function ConnectButton({ wallet, onConnect }: Props) {
  if (wallet.status === 'connected' && wallet.addresses) {
    return (
      <div className="card connected">
        <div className="badge green">Connected</div>
        <p className="addr">
          <strong>Shielded:</strong>{' '}
          <code>{wallet.addresses.shieldedAddress.slice(0, 20)}...</code>
        </p>
        <p className="addr">
          <strong>Unshielded:</strong>{' '}
          <code>{wallet.addresses.unshieldedAddress.slice(0, 20)}...</code>
        </p>
      </div>
    );
  }

  if (wallet.status === 'connecting') {
    return (
      <div className="card">
        <div className="badge yellow">Connecting...</div>
      </div>
    );
  }

  return (
    <div className="card">
      {wallet.error && <div className="error">{wallet.error}</div>}
      <button className="btn primary" onClick={() => onConnect('preview')}>
        Connect Lace Wallet
      </button>
      <p className="hint">
        Requires the{' '}
        <a href="https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk" target="_blank" rel="noopener">
          Lace
        </a>{' '}
        Chrome extension
      </p>
    </div>
  );
}
