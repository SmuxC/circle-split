import {
  circlesConfig,
  CirclesConverter,
  encodeCrcV2TransferData,
  hexToBytes,
} from '@aboutcircles/sdk-utils';
import { TransferBuilder } from '@aboutcircles/sdk-transfers';

export const CRC_PREFIX = 'crc_transfer# ';

const transferBuilder = new TransferBuilder(circlesConfig[100]);

export function isCrcTransfer(text: string): boolean {
  return text.startsWith(CRC_PREFIX);
}

export type CrcTransferPayload = {
  value: string;
  to: string;
  note: string;
};

export function parseCrcTransfer(text: string): CrcTransferPayload | null {
  if (!isCrcTransfer(text)) return null;
  try {
    return JSON.parse(text.slice(CRC_PREFIX.length)) as CrcTransferPayload;
  } catch {
    return null;
  }
}

/**
 * Encodes a 32-byte XMTP messageId as type 0x0002 per Circles spec.
 * Returns the hex string (0x-prefixed) used to match against on-chain txData.
 */
export function encodeMessageId(messageId: string): string {
  return encodeCrcV2TransferData([messageId], 0x0002);
}

type WalletClientLike = {
  sendBatchTransactions?: (txs: TxLike[]) => Promise<string>;
  sendTransaction?: (tx: TxLike) => Promise<string>;
};

type TxLike = { to: string; data?: string; value?: bigint };

/**
 * Creates a minimal wallet client from the Circles miniapp SDK.
 * Returns undefined when running outside miniapp host.
 */
async function buildWalletClient(): Promise<WalletClientLike | null> {
  const { isMiniappMode, sendTransactions } = await import('@aboutcircles/miniapp-sdk');
  if (!isMiniappMode()) return null;
  return {
    sendBatchTransactions: async (txs) => {
      const hashes = await sendTransactions(
        txs.map((tx) => ({
          to: tx.to,
          value: tx.value !== undefined ? String(tx.value) : '0',
          data: tx.data ?? '0x',
        })),
      );
      return hashes[0];
    },
    sendTransaction: async (tx) => {
      const hashes = await sendTransactions([
        {
          to: tx.to,
          value: tx.value !== undefined ? String(tx.value) : '0',
          data: tx.data ?? '0x',
        },
      ]);
      return hashes[0];
    },
  };
}

type CrcTransferArgs = {
  source: string;
  sink: string;
  amountCRC: string;
  note?: string;
  peerDisplay?: string;
  conversation: {
    sendText(text: string, optimistic?: boolean): Promise<string>;
    publishMessages(): Promise<void>;
  };
};

/**
 * Sends a CRC transfer linked to an XMTP message.
 *
 * Flow:
 * 1. Build + send XMTP message optimistically → get messageId
 * 2. Encode messageId as type 0x0002 txData
 * 3. Publish XMTP message (before wallet sign to avoid intent TTL expiry)
 * 4. Construct on-chain transfer via TransferBuilder
 * 5. Submit via miniapp sendTransactions → return hash
 */
export async function callCrcTransfer(
  args: CrcTransferArgs,
): Promise<{ hash: string; messageId: string }> {
  const walletClient = await buildWalletClient();
  if (!walletClient) throw new Error('CRC transfers require the Circles miniapp host.');

  const { source, sink, amountCRC, note, peerDisplay, conversation } = args;

  const payload = JSON.stringify({ value: amountCRC, to: peerDisplay ?? sink, note: note ?? '' });
  const xmtpMessage = `${CRC_PREFIX}${payload}`;

  const messageId = await conversation.sendText(xmtpMessage, true);

  let txData: Uint8Array | undefined;
  try {
    txData = hexToBytes(encodeMessageId(messageId));
  } catch (e) {
    console.warn('Could not encode messageId, proceeding without txData:', (e as Error).message);
  }

  await conversation.publishMessages();

  const amount = CirclesConverter.circlesToAttoCircles(Number(amountCRC));
  const txs = await transferBuilder.constructAdvancedTransfer(
    source as `0x${string}`,
    sink as `0x${string}`,
    amount,
    txData ? { txData } : undefined,
  ) as TxLike[];

  let hash: string;
  if (walletClient.sendBatchTransactions) {
    hash = await walletClient.sendBatchTransactions(txs);
  } else {
    const FLOW_SELECTOR = '0x0d22d9b5';
    const hashes: string[] = [];
    for (const tx of txs) {
      hashes.push(await walletClient.sendTransaction!(tx));
    }
    const flowIdx = txs.findIndex((tx) => tx.data?.startsWith(FLOW_SELECTOR));
    hash = hashes[flowIdx] ?? hashes[hashes.length - 1];
  }

  return { hash, messageId };
}
