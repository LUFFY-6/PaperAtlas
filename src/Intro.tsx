import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { BookOpen } from 'lucide-react'
import { readerSections } from './sections'
import { history, loadReading } from './storage'
import './intro.css'

const paperCards = [
  ['2001.08361', 'Scaling Laws for Neural Language Models'],
  ['2005.11401', 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks'],
  ['1606.09375', 'Wide Residual Networks'],
  ['2106.09685', 'LoRA: Low-Rank Adaptation of Large Language Models'],
  ['2010.11929', 'An Image is Worth 16x16 Words'],
  ['2005.14165', 'Language Models are Few-Shot Learners'],
  ['1512.03385', 'Deep Residual Learning for Image Recognition'],
  ['1312.6114', 'Auto-Encoding Variational Bayes'],
  ['1406.2661', 'Generative Adversarial Nets'],
  ['1810.04805', 'BERT: Pre-training of Deep Bidirectional Transformers'],
  ['1412.6980', 'Adam: A Method for Stochastic Optimization'],
  ['1706.03762', 'Attention Is All You Need'],
] as const
const nodes = [
  [105, 98, '相关工作'], [490, 104, '方法基线'], [86, 223, '实验设置'],
  [512, 226, '局限'], [216, 272, '可复现'], [388, 272, '研究空白'],
] as const
const artwork = `${import.meta.env.BASE_URL}intro/intro-desk.webp`

export function shouldPlayIntro() {
  try { return sessionStorage.getItem('atlas-intro') !== '1' }
  catch { return true }
}

export function Intro({ owner, onFinish }: { owner?: string; onFinish: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [clock] = useState(() => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
  const [recent, setRecent] = useState<{ title: string; section: number; total: number }>()
  useEffect(() => {
    const stage = dialog.current
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(onFinish, reducedMotion ? 700 : 3900)
    try {
      sessionStorage.setItem('atlas-intro', '1')
    } catch { /* The animation still works when browser storage is disabled. */ }
    stage?.showModal()
    return () => { window.clearTimeout(timer); stage?.close() }
  }, [onFinish])
  useEffect(() => {
    if (owner === undefined) return
    let active = true
    void (async () => {
      const [paper] = await history(owner)
      if (!paper) return
      const sections = readerSections(paper.blocks).filter((part) => !part.kind)
      const state = await loadReading<{ index?: number; sectionId?: string }>(paper.id, owner)
      const index = sections.findIndex((part) => part.id === state?.sectionId)
      const section = index >= 0 ? index + 1 : Math.min(sections.length, Math.max(1, (state?.index ?? 0) + 1))
      if (active) setRecent({ title: paper.historyTitle || paper.title, section, total: sections.length })
    })().catch(() => {})
    return () => { active = false }
  }, [owner])

  return <dialog ref={dialog} className="atlas-intro" aria-label="Paper Atlas 开场" onClick={onFinish}
    onCancel={(event) => { event.preventDefault(); onFinish() }}>
    <button className="intro-skip" type="button" autoFocus>跳过</button>
    <img className="intro-light" src={artwork} alt="" aria-hidden="true" />
    <div className="intro-stamp" aria-hidden="true">03:14 AM · arXiv:1706.03762v7</div>
    <div className="intro-stack" aria-hidden="true">
      {paperCards.map(([id, title], i) => {
        const angle = i / paperCards.length * Math.PI * 2
        return <div key={id} className="intro-sheet" style={{
          '--delay': `${.4 + i * .032}s`, '--x': `${Math.round(Math.cos(angle) * 100)}cqi`,
          '--y': `${Math.round(Math.sin(angle) * 65)}vh`, '--tilt': `${(i % 7 - 3) * 5}deg`,
        } as CSSProperties}>
          <small>ARXIV · {id}</small><strong>{title}</strong><i /><i />
        </div>
      })}
    </div>
    <p className="intro-overnight" aria-hidden="true">上一世，你在论文海里熬到天亮</p>
    <p className="intro-hours" aria-hidden="true">03:14 → 04:26 → 05:03 → 07:41</p>
    <div className="intro-spark" aria-hidden="true" />
    <div className="intro-ring" aria-hidden="true" /><div className="intro-ring intro-ring-later" aria-hidden="true" />
    <svg className="intro-network" viewBox="0 0 600 320" aria-hidden="true">
      {nodes.map(([x, y, label], i) => <g key={label} style={{ '--delay': `${1.93 + i * .065}s` } as CSSProperties}>
        <line x1="300" y1="156" x2={x} y2={y} />
        <g className="intro-node"><circle cx={x} cy={y} r="5" /><text x={x} y={y + 21}>{label}</text></g>
      </g>)}
      <circle cx="300" cy="156" r="9" /><text x="300" y="181">本文</text>
    </svg>
    <div className="intro-reveal">
      <h1><span>重生之这一世</span><span>我是科研天才</span></h1>
      <p className="intro-brand"><BookOpen size={16} aria-hidden="true" /> PAPER ATLAS · 论文阅读工作台</p>
      <figure className="intro-desk">
        <img src={artwork} alt="" />
        <figcaption>
          <span><time>{clock}</time> {recent ? `正在读《${recent.title}》` : '还没有论文，先从学习库挑一篇'}</span>
          <span>{recent ? `第 ${recent.section} / ${recent.total} 节` : '90 篇 · 自带讲解'}</span>
        </figcaption>
      </figure>
    </div>
  </dialog>
}
