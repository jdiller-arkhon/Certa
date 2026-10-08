import type { SignInScreenProps } from '@certa/contract';
import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';

export function SignInScreen(props: SignInScreenProps) {
  const [email, setEmail] = useState(props.initialEmail ?? '');
  const [password, setPassword] = useState('');
  if (props.magicLinkSentTo) return <Text>Check your email: we sent a sign-in link to {props.magicLinkSentTo}.</Text>;
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Text accessibilityRole="header">Sign in to Certa</Text>
      {props.error && <Text accessibilityRole="alert">{props.error}</Text>}
      <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={{ minHeight: 48, borderWidth: 1 }} />
      <TextInput accessibilityLabel="Password" secureTextEntry value={password} onChangeText={setPassword} style={{ minHeight: 48, borderWidth: 1 }} />
      <Button title="Sign in" disabled={props.loading} onPress={() => props.onSubmitPassword({ email, password })} />
      <Button title="Email me a sign-in link" disabled={props.loading || !email} onPress={() => props.onRequestMagicLink({ email })} />
    </View>
  );
}
