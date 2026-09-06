/// <reference types="vite/client" />

interface MidnightGlobal {
  [key: string]: {
    name: string;
    icon: string;
    apiVersion: string;
    connect(networkId: string): Promise<import('@midnight-ntwrk/dapp-connector-api').ConnectedAPI>;
  };
}

interface Window {
  midnight?: MidnightGlobal;
}
