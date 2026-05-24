const RPC_URL = 'https://rpc.aboutcircles.com/';

const MAX_FLOW_TARGET =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

async function post(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  return (json as { result: unknown }).result;
}

/**
 * Returns the max transferable CRC flow as a human-readable decimal string.
 */
export async function getCirclesMaxFlow(source: string, sink: string): Promise<string> {
  if (!source || !sink) return '0';
  const result = (await post('circlesV2_findPath', [
    { source, sink, targetFlow: MAX_FLOW_TARGET, withWrap: false, quantizedMode: false },
  ])) as { maxFlow?: string } | null;
  const raw = result?.maxFlow;
  if (!raw) return '0';
  const whole = BigInt(raw) / BigInt('1000000000000000000');
  const rem = BigInt(raw) % BigInt('1000000000000000000');
  if (rem === 0n) return whole.toString();
  return `${whole}.${rem.toString().padStart(18, '0').replace(/0+$/, '')}`;
}

export type TransferEntry = {
  transactionHash: string;
  from: string;
  to: string;
  data: string;
};

/**
 * Returns on-chain Circles transfer records for an address.
 * Used to match a messageId-encoded txData against on-chain transfers.
 */
export async function circlesGetTransferData(address: string): Promise<TransferEntry[]> {
  if (!address) return [];
  const result = (await post('circles_getTransferData', [address])) as {
    results?: TransferEntry[];
  } | null;
  return result?.results ?? [];
}
