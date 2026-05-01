import { useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GlassCard, moon, night, star } from '@ioknbo/ui';

/**
 * Sign-in screen — magic link or Google OAuth.
 * Clerk handles all auth flows.
 */
export default function SignInScreen() {
  const { signIn, isLoaded } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleMagicLink = async () => {
    if (!isLoaded || !email.trim()) return;
    setLoading(true);
    try {
      await signIn.create({
        strategy: 'email_link',
        identifier: email.trim(),
        redirectUrl: 'ioknbo://sign-in-callback',
      });
      Alert.alert(
        'Magic link sent ✨',
        'Check your inbox and tap the link to sign in.',
        [{ text: 'OK' }],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert('Sign-in failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>Welcome back.</Text>
        <Text style={styles.subtitle}>Your story continues here.</Text>

        <GlassCard style={styles.card} padding="lg">
          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={moon[500]}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Pressable
            style={[styles.magicBtn, loading && styles.magicBtnLoading]}
            onPress={handleMagicLink}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.magicBtnText}>Send Magic Link ✨</Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable style={styles.googleBtn}>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </Pressable>
        </GlassCard>

        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backText}>← Back to story</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night[900] },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 30,
    color: moon[50],
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'PlayfairDisplay_400Regular_Italic',
    fontSize: 16,
    color: moon[300],
    marginBottom: 8,
  },
  card: { width: '100%', gap: 12 },
  label: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    color: moon[300],
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    color: moon[50],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  magicBtn: {
    backgroundColor: star[500],
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  magicBtnLoading: { opacity: 0.7 },
  magicBtnText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: moon[500],
  },
  googleBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  googleBtnText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: moon[200],
  },
  backLink: { marginTop: 16 },
  backText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: moon[400],
  },
});
