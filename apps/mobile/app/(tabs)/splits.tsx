import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useDebts } from '@ioknbo/api-client';
import { GlassCard, ember, leaf, moon, night, star } from '@ioknbo/ui';
import type { Debt } from '@ioknbo/api-client';

type Tab = 'debts' | 'splits';

/**
 * Splits tab — debt ledger and bill splitting.
 */
export default function SplitsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('debts');
  const { data: debts = [] } = useDebts();

  const borrowed = debts.filter((d: Debt) => d.direction === 'borrowed' && !d.settled_at);
  const lent = debts.filter((d: Debt) => d.direction === 'lent' && !d.settled_at);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Ledger</Text>
        <Pressable style={styles.addButton} onPress={() => router.push('/debt/new')}>
          <Text style={styles.addIcon}>＋</Text>
        </Pressable>
      </View>

      {/* Tab selector */}
      <View style={styles.tabs}>
        {(['debts', 'splits'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabLabel, activeTab === t && styles.tabLabelActive]}>
              {t === 'debts' ? 'Borrowed / Lent' : 'Bill Splits'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'debts' && (
          <>
            {borrowed.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>You Borrowed</Text>
                {borrowed.map((d: Debt) => (
                  <DebtCard key={d.id} debt={d} onPress={() => router.push(`/debt/${d.id}`)} />
                ))}
              </>
            )}
            {lent.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>You Lent</Text>
                {lent.map((d: Debt) => (
                  <DebtCard key={d.id} debt={d} onPress={() => router.push(`/debt/${d.id}`)} />
                ))}
              </>
            )}
            {borrowed.length === 0 && lent.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>All settled. The ledger is clear.</Text>
              </View>
            )}
          </>
        )}
        {activeTab === 'splits' && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No splits yet.</Text>
            <Text style={styles.emptyHint}>Tap ＋ to create a bill split.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DebtCard({ debt, onPress }: { debt: Debt; onPress: () => void }) {
  const color = debt.direction === 'borrowed' ? ember[300] : leaf[400];
  const overdue = debt.due_date && new Date(debt.due_date) < new Date();
  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.debtCard} padding="md">
        <View style={styles.debtLeft}>
          <Text style={[styles.debtDirection, { color }]}>
            {debt.direction === 'borrowed' ? '↓ from' : '↑ to'}
          </Text>
          <Text style={styles.debtName}>{debt.counterparty_name}</Text>
          {debt.due_date && (
            <Text style={[styles.debtDue, overdue && styles.debtOverdue]}>
              {overdue ? '⚠ ' : ''}due {new Date(debt.due_date).toLocaleDateString()}
            </Text>
          )}
        </View>
        <Text style={[styles.debtAmount, { color }]}>
          {debt.currency} {debt.amount.toFixed(2)}
        </Text>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night[900] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 28, color: moon[50] },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: star[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: { color: '#fff', fontSize: 22, lineHeight: 26 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: night[800],
    padding: 4,
    marginBottom: 8,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: star[600] },
  tabLabel: { fontFamily: 'Poppins_500Medium', fontSize: 13, color: moon[400] },
  tabLabelActive: { color: moon[50] },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  sectionTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: moon[400],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  debtCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  debtLeft: { gap: 2 },
  debtDirection: { fontFamily: 'Poppins_500Medium', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  debtName: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: moon[100] },
  debtDue: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: moon[400] },
  debtOverdue: { color: ember[400] },
  debtAmount: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: {
    fontFamily: 'PlayfairDisplay_400Regular_Italic',
    fontSize: 17,
    color: moon[300],
    textAlign: 'center',
  },
  emptyHint: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: moon[500] },
});
