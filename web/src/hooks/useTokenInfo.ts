import { useState, useCallback } from 'react';
import type { WalletBalances } from '../lib/walletAdapter';

export function useTokenInfo() {
  const [usdmColor, setUsdmColor] = useState<string>('');

  const getUsdmColorHex = useCallback(
    (balances: WalletBalances | null): string => {
      if (usdmColor) return usdmColor;
      if (!balances) return '';
      const allColors = [
        ...Object.keys(balances.unshielded),
        ...Object.keys(balances.shielded),
      ].filter((k) => k !== '0'.repeat(64));
      if (allColors.length > 0) {
        console.log('[TokenInfo] Available token colors:', allColors);
        return allColors[0];
      }
      return '';
    },
    [usdmColor],
  );

  return { usdmColor, setUsdmColor, getUsdmColorHex };
}
