/// <reference types="vite/client" />

// `window.ethereum` — injected by MetaMask/other EIP-1193 wallets. Kept
// deliberately minimal (only the surface this app actually calls) rather
// than pulling in a full third-party `@types/...` package for it.
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
}

interface Window {
  ethereum?: Eip1193Provider;
}
