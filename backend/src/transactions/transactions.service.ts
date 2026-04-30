import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_CLIENT } from '../database/database.module';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

const TABLE = 'transactions';

export interface TransactionFilters {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  category?: string;
}

@Injectable()
export class TransactionsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async findAll(userId: string, filters: TransactionFilters = {}) {
    const { page = 1, limit = 30, from, to, category } = filters;
    const offset = (page - 1) * limit;

    let query = this.db
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lte('transaction_date', to);
    if (category) query = query.eq('category', category);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
      hasNextPage: (count ?? 0) > offset + limit,
    };
  }

  async findOne(userId: string, id: string) {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException(`Transaction ${id} not found`);
    return data;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    // Optionally fetch exchange rate to compute amount_base
    const { data, error } = await this.db
      .from(TABLE)
      .insert({ ...dto, user_id: userId, amount_base: dto.amount })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    // Ensure the record belongs to this user
    await this.findOne(userId, id);

    const { data, error } = await this.db
      .from(TABLE)
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    const { error } = await this.db
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}
