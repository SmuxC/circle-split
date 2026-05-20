import { TripList } from '@/components/trips/TripList';

export default function GroupsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
        <p className="text-sm text-muted-foreground">
          Encrypted vacation expense splitters over XMTP.
        </p>
      </div>
      <TripList />
    </div>
  );
}
