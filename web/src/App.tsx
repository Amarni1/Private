import { useState, useCallback } from 'react';
import { useWallet } from './hooks/useWallet';
import { useContract } from './hooks/useContract';
import { useEscrows } from './hooks/useEscrows';
import { useTransactionHistory } from './hooks/useTransactionHistory';
import { Sidebar, type View } from './components/Sidebar';
import { OpenEscrowForm } from './components/OpenEscrowForm';
import { EscrowCard } from './components/EscrowCard';
import { TransactionHistory } from './components/TransactionHistory';
import './App.css';

export default function App() {
  const wallet = useWallet();
  const contract = useContract(wallet.providers);
  const escrows = useEscrows(wallet.providers);
  const history = useTransactionHistory();
  const [contractAddr, setContractAddr] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>('open');

  const handleDeploy = useCallback(async () => {
    const result = await contract.deploy();
    if (result) {
      setContractAddr(result.contractAddress);
      history.addEntry({
        type: 'deploy',
        txHash: result.txHash,
        contractAddress: result.contractAddress,
        detail: 'Contract deployed',
        status: 'submitted',
      });
    }
  }, [contract, history]);

  const handleRefreshEscrows = useCallback(() => {
    if (contractAddr) escrows.refresh(contractAddr);
  }, [contractAddr, escrows]);

  const handleOpen = useCallback(
    async (amount: bigint, releaseMinutes: number, refundHours: number) => {
      let addr = contractAddr;
      if (!addr) {
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
      const result = await contract.openEscrow(addr, amount, releaseMinutes, refundHours);
      if (result) {
        history.addEntry({
          type: 'open',
          txHash: result.txHash,
          contractAddress: addr,
          detail: `${(Number(amount) / 1e6).toFixed(2)} USDM`,
          status: 'submitted',
        });
      }
      return result;
    },
    [contractAddr, contract, history],
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
      }
      handleRefreshEscrows();
    },
    [contractAddr, contract, history, handleRefreshEscrows],
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
      }
      handleRefreshEscrows();
    },
    [contractAddr, contract, history, handleRefreshEscrows],
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
            <OpenEscrowForm
              contractAddress={contractAddr}
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
              <p className="hint">No escrows yet. Open one from the "Open Escrow" tab.</p>
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
