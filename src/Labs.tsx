import { useState } from 'react'
import { ArrowDown, ArrowRight, FlaskConical, Network } from 'lucide-react'
import type { Paper, Related } from './papers'

export function AttentionLab() {
  const tokens = ['猫', '坐在', '垫子', '上']
  const queryVectors = [[2, 0], [1, 1], [0, 2], [0, 1]]
  const keyVectors = [[2, 0], [1, 1], [0, 2], [1, 0]]
  const values = [1, 0.4, 0.8, 0.1]
  const [index, setIndex] = useState(2)
  const query = queryVectors[index]
  const scores = keyVectors.map(([x, y]) => (query[0] * x + query[1] * y) / Math.sqrt(2))
  const exp = scores.map((score) => Math.exp(score))
  const weights = exp.map((x) => x / exp.reduce((sum, value) => sum + value, 0))
  const output = weights.reduce((sum, weight, i) => sum + weight * values[i], 0)
  return <div className="lab">
    <div className="lab-head"><span><FlaskConical size={16} /> 缩放点积注意力</span><span className="lab-label">交互示例</span></div>
    <div className="formula">Attention(Q, K, V) = softmax(QKᵀ / √dₖ)V</div>
    <div className="lab-row"><span>查询词</span><div className="token-list">{tokens.map((token, i) => <button key={token} aria-pressed={i === index} onClick={() => setIndex(i)}>{token}</button>)}</div></div>
    <div className="bars" aria-label="注意力权重">
      {tokens.map((token, i) => <div className="bar-row" key={token}><span>{token}</span><div className="bar-track"><div style={{ width: `${weights[i] * 100}%` }} /></div><strong>{(weights[i] * 100).toFixed(1)}%</strong></div>)}
    </div>
    <div className="lab-foot"><span>示意向量 · q = [{query.join(', ')}]</span><strong>加权输出 {output.toFixed(3)}</strong></div>
  </div>
}

export function DashLab() {
  const [pressure, setPressure] = useState<'systolic' | 'diastolic'>('systolic')
  const values = pressure === 'systolic' ? [0, -2.8, -5.5] : [0, -1.1, -3]
  return <div className="lab">
    <div className="lab-head"><span><FlaskConical size={16} /> 随机分组与终点</span><span className="lab-label">原论文结果</span></div>
    <div className="flow"><span>459 名参与者</span><ArrowRight size={16} /><span>3 周导入</span><ArrowRight size={16} /><span>随机分组 · 8 周</span></div>
    <div className="lab-row"><span>结果指标</span><div className="token-list">
      <button aria-pressed={pressure === 'systolic'} onClick={() => setPressure('systolic')}>收缩压</button>
      <button aria-pressed={pressure === 'diastolic'} onClick={() => setPressure('diastolic')}>舒张压</button>
    </div></div>
    <div className="bars">{['对照组', '果蔬组', '组合饮食组'].map((group, i) => <div className="bar-row" key={group}><span>{group}</span><div className="bar-track"><div style={{ width: `${Math.abs(values[i]) / 6 * 100}%` }} /></div><strong>{values[i].toFixed(1)}</strong></div>)}</div>
    <div className="lab-foot"><span>相对对照组额外变化（mmHg）</span><strong>来源 · 摘要 Results</strong></div>
  </div>
}

export function WageLab() {
  const [after, setAfter] = useState(21)
  const effect = (after - 20) - (16 - 18)
  return <div className="lab">
    <div className="lab-head"><span><FlaskConical size={16} /> 双重差分计算</span><span className="lab-label">模拟数据</span></div>
    <table className="did"><thead><tr><th>样本</th><th>政策前</th><th>政策后</th><th>变化</th></tr></thead>
      <tbody><tr><th>新泽西</th><td>20</td><td>{after}</td><td>{after - 20}</td></tr><tr><th>宾夕法尼亚</th><td>18</td><td>16</td><td>−2</td></tr></tbody></table>
    <label className="slider">调整新泽西的政策后就业数 <input type="range" min="12" max="28" value={after} onChange={(event) => setAfter(Number(event.target.value))} /><output>{after}</output></label>
    <div className="lab-foot"><span>处理组变化 − 对照组变化</span><strong>双重差分 {effect > 0 ? '+' : ''}{effect}</strong></div>
  </div>
}

export function Comparisons({ paper, onRelation }: { paper: Paper; onRelation: (id: string) => void }) {
  return <div className="tab-content">
    <h2>同类方法对比</h2>
    <p className="subtle">沿着研究问题、方法和适用条件逐篇比较。</p>
    <div className="table-wrap"><table className="comparison">
      <thead><tr><th>论文</th><th>研究问题</th><th>方法</th><th>关键差异</th></tr></thead>
      <tbody><tr className="current-row"><th>{paper.short}<span>{paper.year} · 当前论文</span></th><td>{paper.question}</td><td>{paper.method}</td><td>比较基准</td></tr>
        {paper.related?.map((work) => <tr key={work.id}><th><button className="text-button" onClick={() => onRelation(work.id)}>{work.short}</button><span>{work.year}</span></th><td>{work.problem}</td><td>{work.method}</td><td>{work.difference}</td></tr>)}</tbody>
    </table></div>
  </div>
}

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
