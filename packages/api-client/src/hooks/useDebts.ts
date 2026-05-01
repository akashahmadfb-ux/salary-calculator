import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiDelete, apiGet, apiPatch, apiPost } from '../client';
import type { CreateDebtDto, Debt } from '../types';

export const DEBTS_KEY = 'debts';

export function useDebts() {
  return useQuery({
    queryKey: [DEBTS_KEY],
    queryFn: () => apiGet<Debt[]>('/debts'),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateDebtDto) => apiPost<Debt, CreateDebtDto>('/debts', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DEBTS_KEY] }),
  });
}

export function useSettleDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPatch<Debt, { settled_at: string }>(`/debts/${id}/settle`, {
        settled_at: new Date().toISOString(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DEBTS_KEY] }),
  });
}

export function useDeleteDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/debts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [DEBTS_KEY] }),
  });
}
