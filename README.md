# Paper Atlas · 论文图谱

面向刚接触某一研究方法的读者。导入论文，选中难懂的页或文段，获得按学科组织的讲解、例子和可回查引文。在同一个工作台比较方法、查看参考文献关系。

## 运行

需要 Node.js 22.18 或更新版本。

```powershell
npm ci
npm run dev -- --port 5174
```

打开 http://127.0.0.1:5174/。内置实验、预设对比、文本提取和 Crossref 查询无需模型密钥。实时讲解使用服务端的 `DASHSCOPE_API_KEY` 环境变量，也可将 `.env.example` 复制为 `.env.local` 后配置。默认模型是 `qwen-plus`。密钥不会发给浏览器。

## 可演示的阅读任务

| 学科 | 预设论文 | 操作 |
| --- | --- | --- |
| 计算机科学 | Attention Is All You Need | 切换查询词，观察缩放点积、softmax 权重和加权输出。例子使用示意向量。 |
| 医学与公共卫生 | DASH 饮食试验 | 查看随机分组流程，切换收缩压和舒张压指标。图中的数值来自原论文摘要 Results。 |
| 经济学 | 最低工资与就业 | 调整模拟样本的政策后就业数，观察双重差分如何重算，对照后续再分析的数据来源。 |

1. 导入 PDF、DOCX、Markdown、TXT，也可粘贴文字，选择所属学科。
2. 从右栏打开一页或一段，点击「讲解这个文段」。可附问题或附带相邻文段。
3. 在「方法对比」查看预设对照表，或从当前论文库选一篇同领域文献，比较所选文段与另一篇的开头部分。
4. 在「论文关系」点击节点查看关系和来源，也可输入 DOI 查询 Crossref 的真实参考文献。可试 `10.1056/NEJM200101043440101`。

## 实现与范围

- React + TypeScript + Vite。PDF.js 和 Mammoth 在浏览器提取文本，按格式动态加载。PDF 最多读取前 40 页。输入上限为 24 MB，需要可提取文字的 PDF。导入内容保留在当前页面会话。
- 三个学科使用不同讲解提示。Qwen 返回结构化讲解和引文，Node 服务拒绝找不到或归错文段的引文。对比结果至少引用两篇文献各一处。逐字检查验证出处，语义准确与证据充分性仍需读者核对。
- 预设的笔记是按原文位置编写的中文说明。模型可引用这些笔记。导入文件的引用则定位到提取的文字及页码或段号。
- 关系网中的预设边含人工核对的引用或主题关系。查询图按 Crossref 返回的论文标题建立独立中心节点，最多查前六条有 DOI 的参考文献。图形交互与计算实验在前端确定性执行。
- 只有主动提交讲解时，所选论文文段随问题发送至服务端配置的模型。DOI 查询只向 Crossref 提交 DOI。
- 本版图表是针对预设论文编写的教学组件。导入论文支持文本讲解、举例与双文段对比。扫描 OCR、公式和原版式保留、全库语义推荐、论文多跳图谱与持久化属于后续范围。

```powershell
npm test
npm run build
npm run preview -- --port 5174
```

Vite 开发和预览服务都接入辅助 API。公网部署需提供相应的服务端运行环境。

## 开源组件与对标

- 文档提取复用 [Mozilla PDF.js](https://github.com/mozilla/pdf.js) 和 [Mammoth.js](https://github.com/mwilliamson/mammoth.js)。
- 界面按 [ECC frontend-design-direction](https://github.com/affaan-m/ECC/tree/main/skills/frontend-design-direction) 设计。
- 证据就地呈现参考 [ScholarPhi](https://scholarphi.org/)；同类工作台对标 [Trace Research Paper Studio](https://github.com/Ahmet-Ruchan/trace-research-paper-studio)。
- 实时引用数据来自 [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)。
