import { BookOpen, Cpu, FlaskConical, GraduationCap, Shapes, TrendingUp } from 'lucide-react'

export const fields = { engineering: '工学', science: '理学', literature: '文学', economics: '经济学', education: '教育学', custom: '其他' } as const
export const fieldIcon = { engineering: Cpu, science: FlaskConical, literature: BookOpen, economics: TrendingUp, education: GraduationCap, custom: Shapes }
export type Field = keyof typeof fields
export const customFieldPrefix = 'field:'
export const disciplines = {
  engineering: { computing: '计算机与人工智能', mechanical: '机械与机器人', electronics: '电子信息', civil: '土木与交通工程', materials: '材料科学与工程' },
  science: { physics: '物理与天文学', mathematics: '数学与统计', chemistry: '化学', earth: '地球科学与气象' },
  literature: { narrative: '叙事与文学批评', digital: '数字文学', linguistics: '语言学', translation: '翻译学' },
  economics: { labor: '劳动与应用经济学', macro: '宏观经济学', finance: '金融学' },
  education: { policy: '教育政策与学习效果', edtech: '教育技术学', edpsych: '教育心理学' },
  custom: {},
} as const satisfies Record<Field, Record<string, string>>
export function disciplineOptions(field: Field): [string, string][] {
  return Object.entries(disciplines[field])
}
export const customDisciplinePrefix = 'custom:'
export const maxDisciplineName = 60

export function validDiscipline(field: Field, value: string) {
  const trimmed = value.trim()
  if (field !== 'custom' && (!trimmed || Object.hasOwn(disciplines[field], trimmed))) return true
  if (field !== 'custom' && !trimmed.startsWith(customDisciplinePrefix)) return false
  const name = (field === 'custom' ? trimmed : trimmed.slice(customDisciplinePrefix.length)).trim()
  return name.length > 0 && name.length <= maxDisciplineName && !/[\u0000-\u001f\u007f]/u.test(name)
}

export function disciplineLabel(field: Field, discipline?: string) {
  if (field === 'custom') return discipline || fields.custom
  if (discipline?.startsWith(customDisciplinePrefix)) return discipline.slice(customDisciplinePrefix.length).trim() || fields[field]
  return disciplineOptions(field).find(([id]) => id === discipline)?.[1] || fields[field]
}
export const readingStyles = { practical: '务实', witty: '风趣' } as const
export type ReadingStyle = keyof typeof readingStyles
export const normalizeStyle = (value: unknown): ReadingStyle => value === 'witty' ? 'witty' : 'practical'
export const fieldPrompts: Record<Field, string> = {
  engineering: '拆解工程约束、设计取舍、数据流与实验基线。用具体输入或故障例解释每一步，并区分测试结果与部署条件。',
  science: '区分假说、推导与实测。解释变量、假设、测量方法和不确定性，指出哪条证据支持哪项结论。',
  literature: '先说明作品、语境和批评传统，再拆解论点、文本细读与论证过程；区分文本证据、作者解读和其他可能读法。',
  economics: '先明确因果问题、分析单位和反事实，再说明识别策略、机制、估计量与外推范围。',
  education: '说明学生、教师或学校的分配单位、教学干预和参照组，区分短期表现与长期效果，解释公平和外部效度。',
  custom: '根据项目学科调整术语与举例，按问题、方法、证据和局限解释。',
}
export function normalizeField(value: unknown): Field {
  if (typeof value === 'string' && Object.hasOwn(fields, value)) return value as Field
  if (value === 'cs') return 'engineering'
  if (value === 'medicine') return 'science'
  return 'custom'
}
export type Project = { id: string; title: string; field: Field; discipline?: string }
export type Block = { id: string; title: string; text: string }
export type Related = {
  id: string; short: string; title: string; year: string; relation: string; url: string
  problem: string; method: string; difference: string; evidence?: string; evidenceSource?: string; cites?: string[]
}
export type Paper = {
  lastOpened?: number
  id: string; title: string; short: string; author: string; year: string; venue: string; field: Field
  url?: string; blocks: Block[]; format?: string; partial?: boolean; original?: Blob; pdfUrl?: string
  pdfTextStatus?: 'no-text' | 'password' | 'unreadable' | 'large'; pdfPages?: number
  question?: string; method?: string; related?: Related[]; projectId?: string; discipline?: string; historyTitle?: string; customField?: string
}
