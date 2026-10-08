import { Tabs } from 'expo-router';
import { SessionProvider, useSession } from '@/containers/session-context';
import { SyncBanner } from '@/screens';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

function Banner() {
  const { shell } = useSession();
  const qc = useQueryClient();
  return <SyncBanner sync={shell.sync} onSyncNow={() => qc.invalidateQueries()} />;
}

export default function TabsLayout() {
  return (
    <SessionProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Banner />
        <Tabs screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="index" options={{ title: 'Today' }} />
          <Tabs.Screen name="more" options={{ title: 'More' }} />
        </Tabs>
      </SafeAreaView>
    </SessionProvider>
  );
}
