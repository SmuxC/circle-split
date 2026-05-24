import { IdentifierKind } from '@xmtp/browser-sdk';
import type { Signer } from '@xmtp/browser-sdk';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0) {
    throw new Error(`Invalid hex signature length (${clean.length}). Raw: ${hex}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function createEOASigner(
  address: string,
  signMessage: (message: string) => Promise<string>,
): Signer {
  return {
    type: 'EOA',
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string) => {
      const signature = await signMessage(message);
      return hexToBytes(signature);
    },
  };
}

export function createSCWSigner(
  address: string,
  signMessage: (message: string) => Promise<string>,
  chainId = 100,
): Signer {
  return {
    type: 'SCW',
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string) => {
      const signature = await signMessage(message);
      if (!signature || typeof signature !== 'string') {
        throw new Error(`SCW signMessage returned invalid signature: ${JSON.stringify(signature)}`);
      }
      const bytes = hexToBytes(signature);
      if (bytes.length < 65) {
        console.warn(
          `SCW signature is ${bytes.length} bytes — Safe ERC-1271 signatures are typically ≥65 bytes.`,
        );
      }
      return bytes;
    },
    getChainId: () => BigInt(chainId),
  };
}

/**
 * Builds the correct XMTP signer for the current context:
 * - Inside Circles miniapp host → SCW signer via ERC-1271 (chain 100)
 * - Standalone dev → EOA signer is unavailable without wagmi; returns SCW with empty sign
 *   (XMTP init will fail gracefully with a clear error)
 */
export async function buildXmtpSigner(address: string): Promise<Signer> {
  const { isMiniappMode, signMessage } = await import('@aboutcircles/miniapp-sdk');
  if (isMiniappMode()) {
    return createSCWSigner(
      address,
      async (message) => {
        const { signature } = await signMessage(message, 'erc1271');
        return signature;
      },
      100, // Gnosis Chain
    );
  }
  // Standalone mode: no wallet signer available — caller should handle the error.
  return createSCWSigner(
    address,
    async () => {
      throw new Error(
        'XMTP requires the Circles miniapp host for signing. Open this app inside the Circles playground.',
      );
    },
    100,
  );
}
