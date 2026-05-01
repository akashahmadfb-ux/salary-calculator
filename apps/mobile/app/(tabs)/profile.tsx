import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GlassCard, moon, night, semantic, star } from '@ioknbo/ui';

/**
 * Profile tab — user settings, data export, account management.
 */
export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={styles.name}>{user?.fullName ?? 'Wanderer'}</Text>
            <Text style={styles.email}>{user?.primaryEmailAddress?.emailAddress ?? ''}</Text>
          </View>
        </View>

        {/* Settings sections */}
        <Text style={styles.sectionLabel}>Account</Text>
        <GlassCard padding="none" style={styles.menuCard}>
          <MenuItem label="Edit Profile" onPress={() => {}} />
          <MenuItem label="Currency & Language" onPress={() => {}} />
          <MenuItem label="Biometric Lock" onPress={() => {}} />
          <MenuItem label="Notifications" onPress={() => {}} />
        </GlassCard>

        <Text style={styles.sectionLabel}>Data</Text>
        <GlassCard padding="none" style={styles.menuCard}>
          <MenuItem label="Export as PDF" onPress={() => router.push('/export?format=pdf')} />
          <MenuItem label="Export as Excel" onPress={() => router.push('/export?format=excel')} />
          <MenuItem label="Backup to Google Drive" onPress={() => {}} />
          <MenuItem label="Backup to OneDrive" onPress={() => {}} />
        </GlassCard>

        <Text style={styles.sectionLabel}>About</Text>
        <GlassCard padding="none" style={styles.menuCard}>
          <MenuItem label="Privacy Policy" onPress={() => {}} />
          <MenuItem label="Terms of Service" onPress={() => {}} />
          <MenuItem label="Version 1.0.0" onPress={() => {}} disabled />
        </GlassCard>

        <Pressable style={styles.signOutBtn} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={styles.menuItem}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.menuLabel, disabled && styles.menuLabelDisabled]}>{label}</Text>
      {!disabled && <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night[900] },
  content: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 24, gap: 8 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: star[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 20,
    color: '#fff',
  },
  name: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, color: moon[50] },
  email: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: moon[400] },
  sectionLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
    color: moon[400],
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  menuCard: { borderRadius: 16, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  menuLabel: { fontFamily: 'Poppins_500Medium', fontSize: 14, color: moon[100] },
  menuLabelDisabled: { color: moon[400] },
  chevron: { color: moon[400], fontSize: 20 },
  signOutBtn: {
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(232,106,10,0.12)',
    alignItems: 'center',
  },
  signOutText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
    color: '#FF8C33',
  },
});
