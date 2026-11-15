import { ArrowDown, ArrowRight, Network } from 'lucide-react'
import type { Paper, Related } from './papers'

export function Graph({ paper, neighbors, selected, setSelected }: {
  paper: Pick<Paper, 'short'>; neighbors: Related[]; selected: string; setSelected: (id: string) => void
}) {
  const active = neighbors.find((work) => work.id === selected)
  return <>
    <div className="relation-map">
      <div className="graph-root"><Network size={16} />{paper.short}</div>
      <ArrowDown size={18} className="connector" aria-hidden="true" />
      <div className="graph-children">{neighbors.map((work) => <button key={work.id} aria-pressed={selected === work.id} onClick={() => setSelected(work.id)}>
        <small>{work.relation}</small><strong>{work.short}</strong><span>{work.year}</span>
      </button>)}</div>
    </div>
    {active && <div className="relation-detail"><div className="kicker">{active.relation}</div><h3>{active.title}</h3><p>{active.difference}</p><a href={active.url} target="_blank" rel="noreferrer">查看来源 <ArrowRight size={15} /></a></div>}
  </>
}
