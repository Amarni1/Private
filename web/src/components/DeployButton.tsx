interface Props {
  deploying: boolean;
  contractAddress: string | null;
  error: string | null;
  onDeploy: () => void;
}

export function DeployButton({ deploying, contractAddress, error, onDeploy }: Props) {
  if (contractAddress) {
    return (
      <div className="card deployed">
        <div className="badge green">Deployed</div>
        <p className="addr">
          <code>{contractAddress}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      {error && <div className="error">{error}</div>}
      <button className="btn primary" onClick={onDeploy} disabled={deploying}>
        {deploying ? 'Deploying...' : 'Deploy Escrow Contract'}
      </button>
    </div>
  );
}
