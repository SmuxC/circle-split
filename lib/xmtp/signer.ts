import type { Signer } from '@xmtp/browser-sdk';

// Gnosis Chain. Circles miniapp host signs as a Safe deployed here, so XMTP
// must verify the ERC-1271 signature against this chain.
const GNOSIS_CHAIN_ID = 100n;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Invalid hex signature length.');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Builds an XMTP SCW (smart contract wallet) signer that delegates message
 * signing to the Circles miniapp host. The host returns an ERC-1271
 * signature for the Safe; XMTP verifies on-chain when registering / resuming.
 */
export async function buildXmtpSigner(address: string): Promise<Signer> {
  const { signMessage } = await import('@aboutcircles/miniapp-sdk');
  return {
    type: 'SCW',
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      // IdentifierKind.Ethereum = 0. Const-enum value inlined to avoid bundler
      // tree-shake quirks on the wasm-bindings re-export.
      identifierKind: 0,
    }),
    getChainId: () => GNOSIS_CHAIN_ID,
    signMessage: async (message: string) => {
      const { signature } = await signMessage(message, 'erc1271');
      return hexToBytes(signature);
    },
  };
}
