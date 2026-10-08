import type { AppShellProps } from '@certa/contract';
import { Button, ScrollView, Text } from 'react-native';

/** Placeholder: account, org switcher, theme, sync, sign out, compliance notice. */
export function MoreScreen(props: Pick<AppShellProps, 'user' | 'organization' | 'orgOptions' | 'theme' | 'sync' | 'complianceNotice' | 'onSwitchOrg' | 'onThemeChange' | 'onSignOut' | 'onSyncNow'>) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text>{props.user.name} · {props.user.roleLabel}</Text>
      <Text>{props.organization.name}</Text>
      {props.orgOptions.filter((o) => !o.current).map((o) => (
        <Button key={o.orgId} title={`Switch to ${o.name}`} onPress={() => props.onSwitchOrg(o.orgId)} />
      ))}
      <Button title={`Theme: ${props.theme}`} onPress={() => props.onThemeChange(props.theme === 'light' ? 'dark' : props.theme === 'dark' ? 'sunlight' : 'light')} />
      <Button title="Sync now" onPress={props.onSyncNow} />
      <Button title="Sign out" onPress={props.onSignOut} />
      <Text>{props.complianceNotice}</Text>
    </ScrollView>
  );
}
