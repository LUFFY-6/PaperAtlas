export type Effort = 'fast' | 'normal' | 'deep'
export const effortLabels = { fast: '快', normal: '标准', deep: '深' } as const
export const normalizeEffort = (value: unknown): Effort => value === 'fast' || value === 'deep' ? value : 'normal'

export function readEffort(): Effort {
  try { return normalizeEffort(localStorage.getItem('paper-atlas-default-effort')) } catch { return 'normal' }
}
