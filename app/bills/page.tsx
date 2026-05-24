import { DebtList } from '@/components/bills/DebtList';
import { RequestList } from '@/components/requests/RequestList';

export default function BillsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
        <p className="text-sm text-muted-foreground">
          Who owes you, who you owe — across all your chats.
        </p>
      </div>

      <DebtList title="Bill splits" showPayAll />

      <RequestList
        direction="incoming"
        title="Payment requests"
        emptyLabel="No incoming payment requests."
      />
    </div>
  );
}
