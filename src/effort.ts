export type Effort = 'fast' | 'normal' | 'deep'
export const effortLabels = { fast: '低', normal: '中', deep: '高' } as const
export const normalizeEffort = (value: unknown): Effort => value === 'fast' || value === 'deep' ? value : 'normal'

export function readEffort(): Effort {
  try { return normalizeEffort(localStorage.getItem('paper-atlas-default-effort')) } catch { return 'normal' }
}
