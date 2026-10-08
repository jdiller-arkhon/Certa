import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSession } from '@/containers/session-context';
import { signOut } from '@/lib/session';
import { MoreScreen } from '@/screens';

export default function More() {
  const { shell, switchOrg, setTheme } = useSession();
  const qc = useQueryClient();
  return (
    <MoreScreen
      {...shell}
      onSwitchOrg={switchOrg}
      onThemeChange={setTheme}
      onSyncNow={() => qc.invalidateQueries()}
      onSignOut={async () => {
        await signOut();
        qc.clear();
        router.replace('/(auth)/sign-in');
      }}
    />
  );
}
