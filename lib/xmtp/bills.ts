import {
  APP_ID,
  billSplitCodec,
  billSplitPaymentCodec,
  type BillSplit,
  type BillSplitPayment,
} from './codecs';
import type { DmMessage } from './dms';

export type SplitType = 'equal' | 'i-pay-half' | 'others-half' | 'manual';

export type ShareEntry = { address: string; amount: string };

export function computeShares(
  totalAmount: string,
  allMembers: string[],
  creatorAddress: string,
  splitType: SplitType,
  manualAmounts?: Map<string, string>,
): ShareEntry[] {
  const total = Number(totalAmount);
  if (!total || isNaN(total)) return [];

  const me = creatorAddress.toLowerCase();
  const others = allMembers.map((a) => a.toLowerCase()).filter((a) => a !== me);
  if (others.length === 0) return [];

  const N = allMembers.length;

  switch (splitType) {
    case 'equal': {
      const each = (total / N).toFixed(2);
      return others.map((addr) => ({ address: addr, amount: each }));
    }
    case 'i-pay-half': {
      const each = (total * 0.5 / others.length).toFixed(2);
      return others.map((addr) => ({ address: addr, amount: each }));
    }
    case 'others-half': {
      const each = (total / N * 0.5).toFixed(2);
      return others.map((addr) => ({ address: addr, amount: each }));
    }
    case 'manual': {
      return others.map((addr) => ({
        address: addr,
        amount: manualAmounts?.get(addr) ?? '0',
      }));
    }
  }
}

type Conversation = {
  send: (content: unknown) => Promise<unknown>;
};

export async function sendBillSplit(
  conversation: Conversation,
  args: {
    description: string;
    totalAmount: string;
    symbol: string;
    creator: string;
    shares: ShareEntry[];
  },
): Promise<string> {
  const billId = crypto.randomUUID();
  const payload: BillSplit = {
    kind: 'bill-split',
    appId: APP_ID,
    billId,
    description: args.description,
    totalAmount: args.totalAmount,
    symbol: args.symbol,
    creator: args.creator.toLowerCase(),
    shares: args.shares.map((s) => ({
      address: s.address.toLowerCase(),
      amount: s.amount,
    })),
    createdAt: Math.floor(Date.now() / 1000),
  };
  await conversation.send(billSplitCodec.encode(payload));
  return billId;
}

export async function sendBillSplitPayment(
  conversation: Conversation,
  args: { billId: string; payerAddress: string; txHash?: string },
): Promise<void> {
  const payload: BillSplitPayment = {
    kind: 'bill-split-payment',
    appId: APP_ID,
    billId: args.billId,
    payerAddress: args.payerAddress.toLowerCase(),
    txHash: args.txHash,
  };
  await conversation.send(billSplitPaymentCodec.encode(payload));
}

export type DebtEntry = {
  billId: string;
  description: string;
  symbol: string;
  amount: number;
  counterparty: string;
  paid: boolean;
  txHash?: string;
  direction: 'i-owe' | 'owed-to-me';
};

export function computeDebts(messages: DmMessage[], myAddress: string): DebtEntry[] {
  const me = myAddress.toLowerCase();

  const bills = messages
    .filter((m): m is Extract<DmMessage, { kind: 'bill-split' }> => m.kind === 'bill-split');
  const payments = messages
    .filter((m): m is Extract<DmMessage, { kind: 'bill-split-payment' }> => m.kind === 'bill-split-payment');

  const paidMap = new Map<string, { txHash?: string }>();
  for (const p of payments) {
    const { billId, payerAddress, txHash } = p.payload;
    paidMap.set(`${billId}:${payerAddress}`, { txHash });
  }

  const debts: DebtEntry[] = [];

  for (const msg of bills) {
    const { billId, description, symbol, creator, shares } = msg.payload;
    const creatorAddr = creator.toLowerCase();

    if (creatorAddr === me) {
      for (const share of shares) {
        const addr = share.address.toLowerCase();
        const payment = paidMap.get(`${billId}:${addr}`);
        debts.push({
          billId, description, symbol,
          amount: Number(share.amount),
          counterparty: addr,
          paid: !!payment,
          txHash: payment?.txHash,
          direction: 'owed-to-me',
        });
      }
    } else {
      const myShare = shares.find((s) => s.address.toLowerCase() === me);
      if (myShare) {
        const payment = paidMap.get(`${billId}:${me}`);
        debts.push({
          billId, description, symbol,
          amount: Number(myShare.amount),
          counterparty: creatorAddr,
          paid: !!payment,
          txHash: payment?.txHash,
          direction: 'i-owe',
        });
      }
    }
  }

  return debts;
}
