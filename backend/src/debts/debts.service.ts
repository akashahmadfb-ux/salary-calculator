import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_CLIENT } from '../database/database.module';
import { CreateDebtDto } from './dto/create-debt.dto';

const TABLE = 'debts';

@Injectable()
export class DebtsService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async findAll(userId: string) {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async findOne(userId: string, id: string) {
    const { data, error } = await this.db
      .from(TABLE).select('*').eq('id', id).eq('user_id', userId).single();
    if (error || !data) throw new NotFoundException(`Debt ${id} not found`);
    return data;
  }

  async create(userId: string, dto: CreateDebtDto) {
    const { data, error } = await this.db
      .from(TABLE).insert({ ...dto, user_id: userId }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async settle(userId: string, id: string) {
    await this.findOne(userId, id);
    const { data, error } = await this.db
      .from(TABLE)
      .update({ settled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', userId).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    const { error } = await this.db.from(TABLE).delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}
