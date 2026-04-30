import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

import { SUPABASE_CLIENT } from '../database/database.module';

@Injectable()
export class AiInsightsService {
  private readonly openai: OpenAI;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({ apiKey: config.getOrThrow('OPENAI_API_KEY') });
  }

  /**
   * Generate a weekly narrative reflection for the user.
   * Proxied through the backend so the OpenAI key is never exposed to clients.
   */
  async generateWeeklyReflection(userId: string, from: string, to: string) {
    // Fetch aggregated spending data
    const { data: transactions } = await this.db
      .from('transactions')
      .select('amount, currency, category, merchant, note, mood_tag, transaction_date')
      .eq('user_id', userId)
      .gte('transaction_date', from)
      .lte('transaction_date', to);

    if (!transactions?.length) {
      return {
        narrative_text: 'The week was quiet. No entries were written in the ledger.',
        budget_alert: null,
      };
    }

    // Group by category for the prompt
    const summary = transactions.reduce(
      (acc: Record<string, number>, t) => {
        acc[t.category] = (acc[t.category] ?? 0) + t.amount;
        return acc;
      },
      {},
    );

    const summaryText = Object.entries(summary)
      .map(([cat, total]) => `${cat}: ${total.toFixed(2)}`)
      .join(', ');

    const moodCounts = transactions.reduce(
      (acc: Record<string, number>, t) => {
        if (t.mood_tag) acc[t.mood_tag] = (acc[t.mood_tag] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral';

    const prompt = `You are a gentle, poetic financial companion. Write a short (3-4 sentences), 
emotionally warm weekly reflection for someone whose spending this week was: ${summaryText}. 
Their dominant mood this week was: ${dominantMood}. 
Write in the style of a quiet journal entry — no bullet points, no harsh judgments. 
End with one soft, encouraging sentence about the week ahead.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.8,
    });

    const narrative_text = completion.choices[0]?.message?.content?.trim() ?? '';

    // Detect if wants > 60% of total spending and generate a gentle alert
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    const wantsRatio = (summary['wants'] ?? 0) / (total || 1);
    let budget_alert: string | null = null;

    if (wantsRatio > 0.6) {
      const alertCompletion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Write one very short, gentle, non-judgmental sentence 
(like a kind friend) noting that spending on "wants" was quite high this week. 
No numbers. No lecture. Just a soft, compassionate nudge.`,
          },
        ],
        max_tokens: 60,
        temperature: 0.7,
      });
      budget_alert = alertCompletion.choices[0]?.message?.content?.trim() ?? null;
    }

    // Persist the reflection
    await this.db.from('ai_reflections').insert({
      user_id: userId,
      period_start: from,
      period_end: to,
      narrative_text,
      budget_alert,
    });

    return { narrative_text, budget_alert };
  }
}
