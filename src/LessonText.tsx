import { Fragment } from 'react'

export function LessonText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/u).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>)
  const pieces = text.split(/\r?\n/u)
  const groups: { list: boolean; lines: string[] }[] = []
  for (const line of pieces) {
    const item = /^\s*\d+[.)、]\s*(.+)/u.exec(line)
    const last = groups.at(-1)
    if (item && last?.list) last.lines.push(item[1])
    else groups.push({ list: Boolean(item), lines: [item?.[1] ?? line] })
  }
  return <>{groups.map(({ list, lines }, index) => list
    ? <ol key={index}>{lines.map((line, i) => <li key={i}>{inline(line)}</li>)}</ol>
    : <Fragment key={index}>{index > 0 && !groups[index - 1].list && <br />}{inline(lines[0])}</Fragment>)}</>
}
