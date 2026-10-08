import type { SyncStateViewModel } from '@certa/contract';
import { Pressable, Text } from 'react-native';

/** Placeholder for the shell's sync banner on mobile. */
export function SyncBanner({ sync, onSyncNow }: { sync: SyncStateViewModel; onSyncNow: () => void }) {
  if (sync.status === 'online' && sync.pendingChanges === 0) return null;
  return (
    <Pressable accessibilityRole="button" onPress={onSyncNow} style={{ padding: 12, minHeight: 48 }}>
      <Text>{sync.message ?? `${sync.pendingChanges} changes waiting to sync`}</Text>
    </Pressable>
  );
}
