import { customDisciplinePrefix, disciplineOptions, maxDisciplineName, type Field } from './papers'

export function DisciplineSelect({ field, value, onChange, disabled, required }: {
  field: Field; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean
}) {
  const hasCustomName = field !== 'custom' && value.startsWith(customDisciplinePrefix)
  return <>
    {field !== 'custom' && <label>具体专业<select value={hasCustomName ? customDisciplinePrefix : value} disabled={disabled} required={required} onChange={(event) => onChange(event.target.value)}>
      <option value="">{required ? '请选择专业' : '未指定'}</option>
      {disciplineOptions(field).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      <option value={customDisciplinePrefix}>自定义专业</option>
    </select></label>}
    {(field === 'custom' || hasCustomName) && <label>自定义专业名称<input required maxLength={maxDisciplineName} disabled={disabled}
      value={hasCustomName ? value.slice(customDisciplinePrefix.length) : value} onChange={(event) => onChange((hasCustomName ? customDisciplinePrefix : '') + event.target.value)} /></label>}
  </>
}
