import { useState, useCallback, useRef } from 'react';
import { useWallet } from './hooks/useWallet';
import { useContract } from './hooks/useContract';
import { useEscrows } from './hooks/useEscrows';
import { useTransactionHistory } from './hooks/useTransactionHistory';
import { Sidebar, type View } from './components/Sidebar';
import { OpenEscrowForm } from './components/OpenEscrowForm';
import { EscrowCard } from './components/EscrowCard';
import { TransactionHistory } from './components/TransactionHistory';
import './App.css';

function log(tag: string, msg: string, data?: unknown) {
  console.log(`[App ${tag}]`, msg, data ?? '');
}

export default function App() {
  const wallet = useWallet();
  const contract = useContract(wallet.providers);
  const escrows = useEscrows(wallet.providers);
  const history = useTransactionHistory();
  const [contractAddr, setContractAddr] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>('open');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefreshEscrows = useCallback(() => {
    if (contractAddr) {
      log('refresh', `Refreshing escrows for ${contractAddr}`);
      escrows.refresh(contractAddr);
    }
  }, [contractAddr, escrows]);

  const delayedRefresh = useCallback(
    (addr: string) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        log('delayedRefresh', `Auto-refreshing escrows for ${addr}`);
        escrows.refresh(addr);
      }, 3000);
    },
    [escrows],
  );

  const handleDeploy = useCallback(async () => {
    log('deploy', 'Deploy button clicked');
    const result = await contract.deploy();
    if (result) {
      log('deploy', 'Deploy succeeded, address:', result.contractAddress);
      setContractAddr(result.contractAddress);
      history.addEntry({
        type: 'deploy',
        txHash: result.txHash,
        contractAddress: result.contractAddress,
        detail: 'Contract deployed',
        status: 'submitted',
      });
      delayedRefresh(result.contractAddress);
    }
  }, [contract, history, delayedRefresh]);

  const handleOpen = useCallback(
    async (amount: bigint, releaseMinutes: number, refundHours: number, tokenColorHex: string) => {
      let addr = contractAddr;
      if (!addr) {
        log('open', 'No contract, deploying first...');
        const deployed = await contract.deploy();
        if (!deployed) return null;
        addr = deployed.contractAddress;
        setContractAddr(addr);
        history.addEntry({
          type: 'deploy',
          txHash: deployed.txHash,
          contractAddress: addr,
          detail: 'Contract deployed',
          status: 'submitted',
        });
      }
      log('open', `Opening escrow at ${addr}...`);
      const result = await contract.openEscrow(addr, amount, releaseMinutes, refundHours, tokenColorHex);
      if (result) {
        log('open', 'Escrow opened, preimage saved');
        history.addEntry({
          type: 'open',
          txHash: result.txHash,
          contractAddress: addr,
          detail: `${(Number(amount) / 1e6).toFixed(2)} USDM`,
          status: 'submitted',
        });
        delayedRefresh(addr);
      }
      return result;
    },
    [contractAddr, contract, history, delayedRefresh],
  );

  const handleRelease = useCallback(
    async (escrowId: bigint, preimage: Uint8Array, recipient: string) => {
      if (!contractAddr) return;
      const txHash = await contract.release(contractAddr, escrowId, preimage, recipient);
      if (txHash) {
        history.addEntry({
          type: 'release',
          txHash,
          contractAddress: contractAddr,
          detail: `Escrow #${escrowId}`,
          status: 'submitted',
        });
        delayedRefresh(contractAddr);
      }
    },
    [contractAddr, contract, history, delayedRefresh],
  );

  const handleRefund = useCallback(
    async (escrowId: bigint) => {
      if (!contractAddr) return;
      const txHash = await contract.refund(contractAddr, escrowId);
      if (txHash) {
        history.addEntry({
          type: 'refund',
          txHash,
          contractAddress: contractAddr,
          detail: `Escrow #${escrowId}`,
          status: 'submitted',
        });
        delayedRefresh(contractAddr);
      }
    },
    [contractAddr, contract, history, delayedRefresh],
  );

  return (
    <div className="app-layout">
      <Sidebar
        wallet={wallet}
        contract={contract}
        balances={wallet.balances}
        onConnect={wallet.connect}
        onRefreshBalances={wallet.refreshBalances}
        activeView={activeView}
        onViewChange={setActiveView}
        escrowCount={escrows.escrows.length}
      />

      <main className="main-content">
        {activeView === 'open' && (
          <section>
            <h2>Open Escrow</h2>
            <p className="hint" style={{ marginBottom: '1rem' }}>
              Deposit USDM into a ZK-gated escrow. The buyer proves knowledge of a secret to release funds.
            </p>
            {contractAddr && (
              <div className="hint" style={{ marginBottom: '0.75rem' }}>
                Contract: <code title={contractAddr}>{contractAddr.slice(0, 24)}...</code>
              </div>
            )}
            <OpenEscrowForm
              contractAddress={contractAddr}
              balances={wallet.balances}
              onOpen={handleOpen}
              deploying={contract.deploying}
              calling={contract.calling}
              error={contract.error}
            />
            {wallet.status === 'connected' && wallet.providers && !contractAddr && (
              <div style={{ marginTop: '1rem' }}>
                <button className="btn" onClick={handleDeploy} disabled={contract.deploying}>
                  {contract.deploying ? 'Deploying...' : 'Deploy Contract Separately'}
                </button>
              </div>
            )}
          </section>
        )}

        {activeView === 'escrows' && (
          <section>
            <div className="escrow-list-header">
              <h2>Active Escrows</h2>
              {contractAddr && (
                <button className="btn small" onClick={handleRefreshEscrows}>
                  Refresh
                </button>
              )}
            </div>
            {!contractAddr && (
              <p className="hint">Deploy a contract first from the "Open Escrow" tab.</p>
            )}
            {contractAddr && (
              <div className="hint" style={{ marginBottom: '0.75rem' }}>
                Contract: <code title={contractAddr}>{contractAddr.slice(0, 24)}...</code>
              </div>
            )}
            {contractAddr && escrows.loading && <p>Loading...</p>}
            {contractAddr && escrows.error && <div className="error">{escrows.error}</div>}
            {contractAddr && escrows.escrows.map((e) => (
              <EscrowCard
                key={e.id.toString()}
                escrow={e}
                onRelease={handleRelease}
                onRefund={handleRefund}
                calling={contract.calling}
              />
            ))}
            {contractAddr && !escrows.loading && escrows.escrows.length === 0 && (
              <p className="hint">No escrows found. Try opening one from the "Open Escrow" tab, then refresh.</p>
            )}
          </section>
        )}

        {activeView === 'history' && (
          <section>
            <TransactionHistory
              entries={history.entries}
              onClear={history.clearHistory}
            />
          </section>
        )}
      </main>
    </div>
  );
}
