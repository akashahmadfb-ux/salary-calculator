import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiDelete, apiGet, apiPatch, apiPost } from '../client';
import type {
  CreateSavingsGoalDto,
  SavingsGoal,
  UpdateSavingsGoalDto,
} from '../types';

export const SAVINGS_GOALS_KEY = 'savings-goals';

export function useSavingsGoals() {
  return useQuery({
    queryKey: [SAVINGS_GOALS_KEY],
    queryFn: () => apiGet<SavingsGoal[]>('/savings-goals'),
    staleTime: 1000 * 60 * 5,
  });
}

export function useSavingsGoal(id: string) {
  return useQuery({
    queryKey: [SAVINGS_GOALS_KEY, id],
    queryFn: () => apiGet<SavingsGoal>(`/savings-goals/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSavingsGoalDto) =>
      apiPost<SavingsGoal, CreateSavingsGoalDto>('/savings-goals', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SAVINGS_GOALS_KEY] }),
  });
}

export function useUpdateSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: UpdateSavingsGoalDto) =>
      apiPatch<SavingsGoal, Omit<UpdateSavingsGoalDto, 'id'>>(`/savings-goals/${id}`, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SAVINGS_GOALS_KEY] }),
  });
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/savings-goals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SAVINGS_GOALS_KEY] }),
  });
}
