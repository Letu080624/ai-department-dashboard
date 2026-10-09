/* Trạng thái tour trình diễn (lưu trên trình duyệt để F5 không mất bước đang trình diễn) */
import { useSyncExternalStore } from 'react';
import { uiStorage } from '../data/repository';

export interface TourState { active: boolean; step: number; startedAt: string | null; collapsed: boolean }
const KEY = 'demoTour';
const init: TourState = { active: false, step: 0, startedAt: null, collapsed: false };
let state: TourState = { ...init, ...uiStorage.get<Partial<TourState>>(KEY, {}) };
const ls = new Set<() => void>();
const set = (p: Partial<TourState>) => { state = { ...state, ...p }; uiStorage.set(KEY, state); ls.forEach(f => f()); };

export const tour = {
  get: () => state,
  subscribe: (f: () => void) => { ls.add(f); return () => { ls.delete(f); }; },
  open: () => set({ active: true, step: 0, collapsed: false, startedAt: null }),
  go: (step: number) => set({ step, collapsed: false, startedAt: step >= 1 && !state.startedAt ? new Date().toISOString() : state.startedAt }),
  collapse: (v: boolean) => set({ collapsed: v }),
  close: () => set({ ...init }),
  /** Sau khi khôi phục dữ liệu (localStorage bị xoá) cần ghi lại trạng thái tour */
  restore: (p: Partial<TourState>) => set(p),
};
export const useTour = () => useSyncExternalStore(tour.subscribe, tour.get);
