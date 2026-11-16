import { useLayoutEffect, useRef, useState } from 'react'
import preview from '../docs/intro-preview.html?raw'
import artwork from '../docs/assets/intro-desk-prog.webp?url'

const previewControls = `<script>
  const stage = document.getElementById('stage')
  const theme = document.getElementById('theme')
  const root = document.documentElement
  let timer
  function finish() {
    clearTimeout(timer)
    stage.classList.add('done')
    document.getElementById('enter').focus({ preventScroll: true })
  }
  function play() {
    clearTimeout(timer)
    timer = setTimeout(finish, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 3900)
  }
  function updateThemeLabel() {
    theme.textContent = root.dataset.theme === 'dark' ? '浅色' : '深色'
  }
  document.getElementById('enter').addEventListener('click', () => {
    window.parent.postMessage('paper-atlas:enter-workbench', '*')
  })
  document.getElementById('skip').addEventListener('click', finish)
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish() })
  document.getElementById('replay').addEventListener('click', () => {
    stage.classList.remove('done')
    stage.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 0; animation.play() })
    play()
  })
  theme.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
    updateThemeLabel()
  })
  updateThemeLabel()
  play()
</script>`

export function shouldPlayIntro() {
  try { return sessionStorage.getItem('atlas-intro') !== '2' }
  catch { return true }
}

export function Intro({ onFinish }: { onFinish: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [documentHtml] = useState(() => {
    const theme = document.documentElement.dataset.theme
    const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    const imageUrl = new URL(artwork, window.location.href).href
    return preview
      .replace('data-theme="dark"', dark ? 'data-theme="dark"' : 'data-theme="light"')
      .replace('url(assets/intro-desk-prog.webp)', 'url("' + imageUrl + '")')
      .replace(/<script>[\s\S]*?<\/script>/, () => previewControls)
  })
  useLayoutEffect(() => {
    function enter(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.data !== 'paper-atlas:enter-workbench') return
      try { sessionStorage.setItem('atlas-intro', '2') } catch {}
      document.documentElement.removeAttribute('data-intro-pending')
      onFinish()
    }
    window.addEventListener('message', enter)
    return () => window.removeEventListener('message', enter)
  }, [onFinish])
  return <iframe ref={frame} title="Paper Atlas 开场" sandbox="allow-scripts" srcDoc={documentHtml}
    style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0 }} />
}

