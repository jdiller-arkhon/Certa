import type { ReadinessDashboardScreenProps } from '@certa/contract';
import { Button, ScrollView, Text } from 'react-native';

export function TodayScreen(props: ReadinessDashboardScreenProps) {
  const isEmpty = props.pilots.length === 0 && props.aircraft.length === 0;
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text accessibilityRole="header">Today · {props.asOf.absolute}</Text>
      {props.error && <Text accessibilityRole="alert">{props.error}</Text>}
      {isEmpty ? (
        <>
          <Text>{props.empty.title}</Text>
          <Text>{props.empty.body}</Text>
          {props.empty.actionLabel && <Button title={props.empty.actionLabel} onPress={props.onAddAircraft} />}
        </>
      ) : (
        [...props.pilots, ...props.aircraft].map((r) => (
          <Text key={r.id} onPress={() => props.onOpen(r.href)}>
            {r.name} — {r.status.label}
          </Text>
        ))
      )}
    </ScrollView>
  );
}
