import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { useSignedIn } from '@/containers/session-context';

export default function Index() {
  const me = useSignedIn();
  if (me.isLoading) return <ActivityIndicator style={{ flex: 1 }} />;
  return <Redirect href={me.data ? '/(tabs)' : '/(auth)/sign-in'} />;
}
