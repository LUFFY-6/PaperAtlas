export type Theme = 'light' | 'dark' | 'system'

export function readTheme(): Theme {
  try {
    const value = localStorage.getItem('paper-atlas-theme')
    if (value === 'light' || value === 'dark') return value
  } catch {}
  return 'system'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem('paper-atlas-theme', theme) } catch {}
}
