import { Fragment, useId, useState } from 'react'
import { ArrowUpRight, Minus, Plus, RotateCcw } from 'lucide-react'
import type { Related } from './papers'

export function MethodTable({ works }: { works: Related[] }) {
  return <div className="table-wrap"><table className="comparison">
    <thead><tr><th>论文</th><th>研究问题</th><th>方法</th><th>差异与依据</th></tr></thead>
    <tbody>{works.map((work) => <tr key={work.id}>
      <th><a href={work.url} target="_blank" rel="noreferrer">{work.title} <ArrowUpRight size={12} /></a><span>{work.year} · {work.relation}</span></th>
      <td>{work.problem}</td><td>{work.method}</td><td>{work.difference}
        {work.evidence && <details><summary>查看依据 · {work.evidenceSource}</summary><p>{work.evidence}</p></details>}
      </td>
    </tr>)}</tbody>
  </table></div>
}

export function LiteratureMap({ title, year, works }: { title: string; year: string; works: Related[] }) {
  const [filter, setFilter] = useState('')
  const [selection, setSelection] = useState('')
  const [zoom, setZoom] = useState(1)
  const arrow = useId()
  const visible = filter ? works.filter((work) => work.relation === filter) : works
  const selected = visible.find(({ id }) => id === selection)
  const columns = [
    { title: '本文参考文献', x: 19, works: visible.filter(({ relation }) => relation === '参考文献') },
    { title: '相近问题与方法', x: 50, works: visible.filter(({ relation }) => relation === '同问题' || relation === '方法相关') },
    { title: '引用本文的研究', x: 81, works: visible.filter(({ relation }) => relation === '引用本文') },
  ]
  const center = { x: 50, y: 23 }
  const nodes = columns.flatMap(({ x, works }) => {
    const ordered = [...works].sort((a, b) => (Number(a.year) || Infinity) - (Number(b.year) || Infinity))
    return ordered.map((work, i) => ({ work, x, y: 41 + i * 48 / Math.max(1, ordered.length - 1) }))
  })
  const stageHeight = 316 + 34 * Math.max(...columns.map(({ works }) => works.length))
  const edge = (a: typeof center, b: typeof center, fraction: number, bend = 0) =>
    `${a.x},${a.y} ${a.x + (b.x - a.x) * fraction},${a.y + (b.y - a.y) * fraction + bend} ${b.x},${b.y}`

  return <>
    <div className="map-tools">
      <label>关系 <select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="">全部关系</option>{[...new Set(works.map(({ relation }) => relation))].map((relation) => <option key={relation}>{relation}</option>)}
      </select></label>
      <button className="icon-button" aria-label="缩小关系网" disabled={zoom <= 0.8} onClick={() => setZoom(Math.max(0.8, zoom - 0.2))}><Minus size={16} /></button>
      <button className="icon-button" aria-label="放大关系网" disabled={zoom >= 1.8} onClick={() => setZoom(Math.min(1.8, zoom + 0.2))}><Plus size={16} /></button>
      <button className="icon-button" aria-label="重置缩放" onClick={() => setZoom(1)}><RotateCcw size={15} /></button>
    </div>
    <p className="map-legend subtle">箭头从引用方指向被引用方，虚线表示问题或方法相近。点击节点查看依据。</p>
    <div className="map-viewport" role="region" aria-label="可滚动的论文关系网" tabIndex={0}>
      <div className="map-stage" style={{ width: `max(${zoom * 495}px, ${zoom * 100}%)`, height: `${Math.max(0.88, zoom) * stageHeight}px` }}>
        <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs><marker id={arrow} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0 0 L6 3 L0 6 Z" />
          </marker></defs>
          {nodes.map((node) => {
            const relation = node.work.relation
            const outgoing = relation === '参考文献'
            const citation = outgoing || relation === '引用本文'
            return <polyline key={node.work.id} points={outgoing ? edge(center, node, .5) : edge(node, center, .5)}
              markerMid={citation ? `url(#${arrow})` : undefined} data-inferred={!citation} data-active={selected?.id === node.work.id} />
          })}
          {nodes.flatMap((node) => nodes.filter((target) => node.work.cites?.includes(target.work.id)).map((target) =>
            <polyline key={node.work.id + '→' + target.work.id} points={edge(node, target, .5, Math.abs(node.y - target.y) < 12 ? 8 : 0)}
              markerMid={`url(#${arrow})`} data-active={selected?.id === node.work.id || selected?.id === target.work.id} />))}
        </svg>
        {columns.map((column) => <span className="map-column" key={column.title} style={{ left: `${column.x}%` }}>{column.title}</span>)}
        <div className="map-node map-root" style={{ left: `${center.x}%`, top: `${center.y}%` }}><small>当前论文{year && ` · ${year}`}</small><strong title={title}>{title}</strong></div>
        {nodes.map(({ work, x, y }) => <button key={work.id} type="button" className="map-node" style={{ left: `${x}%`, top: `${y}%` }}
          title={work.title} aria-pressed={selected?.id === work.id} onClick={() => setSelection(work.id)}>
          <small>{work.relation}{work.year && ` · ${work.year}`}</small><strong>{work.title}</strong>
        </button>)}
        {!nodes.length && <p className="map-empty">该关系下暂无论文。</p>}
      </div>
    </div>
    {selected && <div className="relation-detail"><div className="kicker">{selected.relation}</div><h3>{selected.title}</h3>
      <p>{selected.difference}</p>
      {selected.evidence && <details><summary>查看依据 · {selected.evidenceSource}</summary><p>{selected.evidence}</p></details>}
      {works.map((work) => <Fragment key={work.id}>{selected.cites?.includes(work.id) && <p>引用 {work.title}</p>}
        {work.cites?.includes(selected.id) && <p>被 {work.title} 引用</p>}</Fragment>)}
      <a href={selected.url} target="_blank" rel="noreferrer">查看论文 <ArrowUpRight size={15} /></a>
    </div>}
  </>
}
