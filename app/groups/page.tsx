import { CreateGroupSheet } from '@/components/groups/CreateGroupSheet';
import { GroupList } from '@/components/groups/GroupList';

export default function GroupsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
        <CreateGroupSheet />
      </div>
      <GroupList />
    </div>
  );
}
