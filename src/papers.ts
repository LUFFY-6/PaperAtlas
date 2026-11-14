export const fields = { cs: '计算机科学', medicine: '医学与公共卫生', economics: '经济学', other: '其他领域' } as const
export type Field = keyof typeof fields
export const fieldPrompts: Record<Field, string> = {
  cs: '拆解输入、核心算法和输出；给一个能手算的微型例子。',
  medicine: '拆解入组、分组、终点和结果；区分研究观察与外推。',
  economics: '拆解研究对象、处理组、对照组和识别假设；给一个有数字的简例。',
  other: '拆解研究问题、方法、证据和边界；给一个便于理解的例子。',
}
export type Block = { id: string; title: string; text: string }
export type Related = {
  id: string; short: string; title: string; year: string; relation: string; url: string
  problem: string; method: string; difference: string
}
export type Paper = {
  id: string; title: string; short: string; author: string; year: string; venue: string; field: Field
  url?: string; blocks: Block[]; format?: string; partial?: boolean
  question?: string; method?: string; related?: Related[]
}

export const papers: Paper[] = [
  {
    id: 'transformer', short: 'Attention Is All You Need', title: 'Attention Is All You Need',
    author: 'Vaswani 等', year: '2017', venue: 'NeurIPS', field: 'cs', url: 'https://arxiv.org/abs/1706.03762',
    question: '序列到序列模型能否摆脱循环结构，同时仍捕捉序列中的长距离依赖？',
    method: '用注意力在序列位置之间传递信息。编码器和解码器堆叠注意力模块；位置编码帮助模型保留词序。',
    blocks: [
      { id: 'abstract', title: '摘要 · 研究出发点', text: '原文摘要介绍 Transformer，主张机器翻译的序列模型可以用注意力替代循环和卷积结构，并在两个翻译任务上评估。' },
      { id: '3.2.1', title: '§3.2.1 · 缩放点积注意力', text: '查询向量与键向量做点积，结果除以键向量维度的平方根。对缩放后的分数执行 softmax，再用得到的权重对值向量求加权和。' },
      { id: '3.2.2', title: '§3.2.2 · 多头注意力', text: '分别将查询、键和值投影到多个子空间，在每个头独立计算注意力。连接各头的输出，再投影成最终向量。' },
      { id: '5', title: '§5–6 · 训练与实验', text: '作者使用 WMT 2014 英德、英法翻译任务评估架构。示意权重用于理解算子，真实模型的向量由训练学习得到。' },
    ],
    related: [
      { id: 'bahdanau', short: 'Bahdanau Attention', title: 'Neural Machine Translation by Jointly Learning to Align and Translate', year: '2014', relation: '引用 · 早期对齐机制', url: 'https://arxiv.org/abs/1409.0473', problem: '机器翻译中的动态对齐', method: '循环编码器—解码器 + 加性注意力', difference: '解码时选择源端信息，主体仍使用循环网络。' },
      { id: 'bert', short: 'BERT', title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', year: '2018', relation: '后续引用 · 架构复用', url: 'https://arxiv.org/abs/1810.04805', problem: '通用语言表征的预训练', method: '双向 Transformer 编码器', difference: '采用编码器做预训练与下游理解，任务与机器翻译不同。' },
    ],
  },
  {
    id: 'dash', short: 'DASH 饮食试验', title: 'A Clinical Trial of the Effects of Dietary Patterns on Blood Pressure',
    author: 'Appel 等', year: '1997', venue: 'NEJM', field: 'medicine', url: 'https://pubmed.ncbi.nlm.nih.gov/9099655/',
    question: '控制体重和盐摄入时，改变整体饮食模式能否影响试验参与者的血压？',
    method: '对照饮食导入后，随机分配三种供餐方案并比较血压变化。用分组图理解对照与主比较。',
    blocks: [
      { id: 'methods', title: 'Methods · 随机分组', text: '459 名成人先接受三周对照饮食，随后随机分配到对照、富含水果蔬菜或组合饮食组，为期八周。研究保持钠摄入和体重稳定。' },
      { id: 'results', title: 'Results · 相对对照的血压变化', text: '组合饮食相对对照组的收缩压和舒张压分别额外降低 5.5 和 3.0 mmHg。果蔬组相对对照的数值分别为 2.8 和 1.1 mmHg。' },
      { id: 'limits', title: '阅读边界 · 研究设计', text: '这是供餐条件下的短期试验。阅读时留意实际试验条件、终点与参与者范围。' },
    ],
    related: [
      { id: 'sodium', short: 'DASH-Sodium', title: 'Effects on Blood Pressure of Reduced Dietary Sodium and the DASH Diet', year: '2001', relation: '同主题 · 追加钠摄入条件', url: 'https://pubmed.ncbi.nlm.nih.gov/11136953/', problem: '钠摄入及饮食模式对血压的影响', method: '对照或 DASH 饮食，各经历三个钠水平', difference: '将钠水平作为研究因素，比较条件与原试验不同。' },
      { id: 'subgroups', short: 'DASH-Sodium 亚组', title: 'Effects of Diet and Sodium Intake on Blood Pressure: Subgroup Analysis of the DASH-Sodium Trial', year: '2001', relation: '同主题 · 亚组分析', url: 'https://pubmed.ncbi.nlm.nih.gov/11747380/', problem: '不同亚组的血压变化', method: 'DASH-Sodium 试验亚组分析', difference: '关注组间异质性，使用的是 DASH-Sodium 数据。' },
    ],
  },
  {
    id: 'wage', short: '最低工资与就业', title: 'Minimum Wages and Employment: A Case Study of the Fast Food Industry',
    author: 'Card 与 Krueger', year: '1994', venue: 'AER', field: 'economics', url: 'https://www.nber.org/papers/w4509',
    question: '新泽西州最低工资上涨后，当地快餐店的就业相对宾州对照样本如何变化？',
    method: '比较政策前后两地店铺的就业变化。双重差分计算的是两个变化量的差。',
    blocks: [
      { id: 'design', title: '研究设计 · 跨州自然实验', text: '1992 年新泽西州最低工资从 4.25 美元升到 5.05 美元，宾夕法尼亚州未同步提高。研究者对两地 410 家快餐店开展政策前后调查。' },
      { id: 'compare', title: '研究方法 · 比较变化', text: '比较新泽西州和宾夕法尼亚州餐厅的就业变化，以相邻地区作为比较组。因果解读依赖缺少政策变化时两组趋势相近的假设。' },
      { id: 'limits', title: '延伸阅读 · 重新分析', text: '后续研究以工资记录重新估计。这些研究的数据来源、样本和比较方式值得逐项核对。' },
    ],
    related: [
      { id: 'reestimate', short: '工资记录复核', title: 'The Effect of New Jersey’s Minimum Wage Increase on Fast-Food Employment: A Re-Evaluation Using Payroll Records', year: '1995', relation: '再分析 · 不同数据', url: 'https://www.nber.org/papers/w5224', problem: '同一政策变化的就业影响', method: '快餐企业工资记录重新估计', difference: '改用工资记录，比较样本与调查方式。' },
      { id: 'reply', short: '代表性工资数据回应', title: 'A Reanalysis of the Effect of the New Jersey Minimum Wage Increase on the Fast-Food Industry with Representative Payroll Data', year: '1998', relation: '回应 · 替代样本', url: 'https://www.nber.org/papers/w6386', problem: '原结论对样本来源的敏感性', method: '以代表性工资数据重新分析', difference: '使用不同的工资数据样本回应前述复核。' },
    ],
  },
]
