import { useState, useCallback } from 'react';
import { useWallet } from './hooks/useWallet';
import { useContract } from './hooks/useContract';
import { useEscrows } from './hooks/useEscrows';
import { ConnectButton } from './components/ConnectButton';
import { BalanceDisplay } from './components/BalanceDisplay';
import { DeployButton } from './components/DeployButton';
import { OpenEscrowForm } from './components/OpenEscrowForm';
import { EscrowCard } from './components/EscrowCard';
import './App.css';

export default function App() {
  const wallet = useWallet();
  const contract = useContract(wallet.providers);
  const escrows = useEscrows(wallet.providers);
  const [contractAddr, setContractAddr] = useState<string | null>(null);

  const handleDeploy = useCallback(async () => {
    const addr = await contract.deploy();
    if (addr) setContractAddr(addr);
  }, [contract]);

  const handleRefreshEscrows = useCallback(() => {
    if (contractAddr) escrows.refresh(contractAddr);
  }, [contractAddr, escrows]);

  const handleOpen = useCallback(
    async (amount: bigint, releaseMinutes: number, refundHours: number) => {
      let addr = contractAddr;
      if (!addr) {
        const deployed = await contract.deploy();
        if (!deployed) return null;
        addr = deployed;
        setContractAddr(addr);
      }
      return contract.openEscrow(addr, amount, releaseMinutes, refundHours) ?? null;
    },
    [contractAddr, contract],
  );

  const handleRelease = useCallback(
    async (escrowId: bigint, preimage: Uint8Array, recipient: string) => {
      if (!contractAddr) return;
      await contract.release(contractAddr, escrowId, preimage, recipient);
      handleRefreshEscrows();
    },
    [contractAddr, contract, handleRefreshEscrows],
  );

  const handleRefund = useCallback(
    async (escrowId: bigint) => {
      if (!contractAddr) return;
      await contract.refund(contractAddr, escrowId);
      handleRefreshEscrows();
    },
    [contractAddr, contract, handleRefreshEscrows],
  );

  return (
    <div className="app">
      <header>
        <h1>USDM Escrow</h1>
        <p className="subtitle">Zero-knowledge gated escrow on Midnight</p>
      </header>

      <main>
        <section>
          <ConnectButton wallet={wallet} onConnect={wallet.connect} />
        </section>

        {wallet.status === 'connected' && (
          <section>
            <BalanceDisplay
              balances={wallet.balances}
              onRefresh={wallet.refreshBalances}
            />
          </section>
        )}

        {wallet.status === 'connected' && wallet.providers && (
          <section>
            <OpenEscrowForm
              contractAddress={contractAddr}
              onOpen={handleOpen}
              deploying={contract.deploying}
              calling={contract.calling}
              error={contract.error}
            />
          </section>
        )}

        {wallet.status === 'connected' && wallet.providers && !contractAddr && (
          <section>
            <DeployButton
              deploying={contract.deploying}
              contractAddress={contractAddr}
              error={contract.error}
              onDeploy={handleDeploy}
            />
          </section>
        )}

        {contractAddr && (
          <section>
            <div className="escrow-list-header">
              <h2>Escrows</h2>
              <button className="btn small" onClick={handleRefreshEscrows}>
                Refresh
              </button>
            </div>
            {escrows.loading && <p>Loading...</p>}
            {escrows.error && <div className="error">{escrows.error}</div>}
            {escrows.escrows.map((e) => (
              <EscrowCard
                key={e.id.toString()}
                escrow={e}
                onRelease={handleRelease}
                onRefund={handleRefund}
                calling={contract.calling}
              />
            ))}
            {!escrows.loading && escrows.escrows.length === 0 && (
              <p className="hint">No escrows yet. Open one above.</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
