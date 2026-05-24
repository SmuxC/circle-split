import { RequestList } from '@/components/requests/RequestList';
import { UserAvatar } from '@/components/wallet/UserAvatar';

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-4">
        <UserAvatar className="size-24 text-xl" />
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">Home</h1>
          <p className="text-sm text-muted-foreground">
            Latest payment requests across your XMTP inbox.
          </p>
        </div>
      </div>

      <RequestList
        limit={10}
        title="Recent requests"
        emptyLabel="No payment requests yet. Create one from the New tab."
      />
    </div>
  );
}
