import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiDelete, apiGet, apiPatch, apiPost } from '../client';
import type {
  CreateTransactionDto,
  PaginatedResponse,
  PaginationParams,
  Transaction,
  UpdateTransactionDto,
} from '../types';

export const TRANSACTIONS_KEY = 'transactions';

export function useTransactions(params: PaginationParams = {}) {
  return useQuery({
    queryKey: [TRANSACTIONS_KEY, params],
    queryFn: () =>
      apiGet<PaginatedResponse<Transaction>>('/transactions', { params }),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: [TRANSACTIONS_KEY, id],
    queryFn: () => apiGet<Transaction>(`/transactions/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTransactionDto) =>
      apiPost<Transaction, CreateTransactionDto>('/transactions', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TRANSACTIONS_KEY] }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: UpdateTransactionDto) =>
      apiPatch<Transaction, Omit<UpdateTransactionDto, 'id'>>(`/transactions/${id}`, dto),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [TRANSACTIONS_KEY] });
      qc.invalidateQueries({ queryKey: [TRANSACTIONS_KEY, id] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/transactions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TRANSACTIONS_KEY] }),
  });
}
