import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTransactions } from '@ioknbo/api-client';
import { GlassCard, moon, night, semantic, star } from '@ioknbo/ui';
import type { Transaction } from '@ioknbo/api-client';

/**
 * Journal tab — the emotional diary of spending.
 * Shows a chronological list of transactions styled as diary entries.
 */
export default function JournalScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTransactions({ page, limit: 30 });

  const renderEntry = ({ item }: { item: Transaction }) => {
    const date = new Date(item.transaction_date);
    const day = date.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short' });
    const sign = item.category === 'income' ? '+' : '-';
    const colour = item.category === 'income' ? '#4FBA64' : moon[300];

    return (
      <Pressable onPress={() => router.push(`/transaction/${item.id}`)}>
        <GlassCard style={styles.entry} padding="md">
          <View style={styles.entryLeft}>
            <Text style={styles.emoji}>{item.emoji_tag ?? '📝'}</Text>
            <View style={styles.entryMeta}>
              <Text style={styles.merchant} numberOfLines={1}>
                {item.merchant ?? item.note ?? 'Untitled entry'}
              </Text>
              <Text style={styles.date}>{day}</Text>
              {item.mood_tag && (
                <Text style={styles.mood}>{moodEmoji(item.mood_tag)}</Text>
              )}
            </View>
          </View>
          <Text style={[styles.amount, { color: colour }]}>
            {sign}
            {item.currency} {item.amount.toFixed(2)}
          </Text>
        </GlassCard>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>My Journal</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/transaction/new')}
        >
          <Text style={styles.addIcon}>＋</Text>
        </Pressable>
      </View>

      <FlatList
        data={data?.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (data?.hasNextPage) setPage((p) => p + 1);
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Your story begins with the first entry.
              </Text>
              <Text style={styles.emptyHint}>Tap ＋ to log a transaction.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function moodEmoji(mood: Transaction['mood_tag']): string {
  const map: Record<NonNullable<Transaction['mood_tag']>, string> = {
    happy: '😊',
    sad: '😔',
    anxious: '😟',
    neutral: '😐',
    excited: '🤩',
    tired: '😴',
    grateful: '🙏',
  };
  return mood ? (map[mood] ?? '') : '';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night[900] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 28,
    color: moon[50],
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: star[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: { color: '#fff', fontSize: 22, lineHeight: 26 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  entry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  emoji: { fontSize: 28 },
  entryMeta: { flex: 1 },
  merchant: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: moon[100],
  },
  date: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: moon[400],
    marginTop: 2,
  },
  mood: { fontSize: 12, marginTop: 2 },
  amount: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: {
    fontFamily: 'PlayfairDisplay_400Regular_Italic',
    fontSize: 18,
    color: moon[300],
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  emptyHint: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: moon[500],
  },
});
