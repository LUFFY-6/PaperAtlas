# Paper Atlas · 论文图谱

在科研工作台直接向模型提问，或从左侧论文库导入自己的论文。新建项目和导入可先选研究领域，再选预设专业或填写自定义专业名称。学习库覆盖工学、理学、文学、经济学和教育学 5 个大类，19 个专业方向各收录 10 篇，共 190 篇。预生成精读的状态显示在每篇论文旁。每节讲解包含动机、做法、结果、教学例子和证据边界。

## 运行

需要 Node.js 22.18 或更新版本。

```powershell
npm ci
npm run dev -- --port 5174
```

打开 http://127.0.0.1:5174/。本地文本提取无需模型密钥。AI 讲解、问答和「检索并分析」需要已配置的模型。实时讲解可使用服务端的 `DASHSCOPE_API_KEY` 环境变量，也可将 `.env.example` 复制为 `.env.local` 后配置。默认模型是 `qwen-plus`，服务端的默认密钥留在服务端。

也可以在「设置」中打开模型页，选择通义千问、DeepSeek、OpenAI、Ollama 或自定义，填写兼容 OpenAI Chat Completions 的接口地址和密钥，读取模型列表后选择模型，再点击「测试连接」和「启用模型」。本机预览可连接默认端口的 Ollama，公网接口使用 HTTPS。勾选「在此浏览器记住」后，接口、模型和密钥会保存在同一浏览器的站点存储中。可通过「恢复默认模型」或「断开模型」清除。连接测试只发送固定测试消息。

## 阅读流程

1. 从工作台左侧阅读历史继续，或把 PDF、DOCX、Markdown、TXT 拖到左侧论文库或中央输入框。可用加号粘贴正文。注册登录后，新建项目时先选学科再填写项目名。
2. 从章节目录进入任意一节，调用「讲解本节」或「生成全文讲解」。全文任务从头按顺序生成，一节完成便可查看。点击「定位原文」可圈出 PDF 中的当前小节。鼠标划选原文后可直接使用「划词查询」。已完成的小节会随阅读进度保存，取消或出错后可以继续。
3. 在「方法对比」点击「检索并分析」，按当前论文的问题查找相关工作，或选择已导入的同领域论文做文段对照。
4. 在「论文关系」查看同一批结果形成的关系网，按关系筛选、缩放，点击节点查看差异和论文出处。
5. 在章节目录末尾打开「全文回顾」，查看文章的研究主线、局限与痛点，以及可以用对照、指标或反例检验的研究想法。
6. 用历史记录行尾的菜单重命名或删除。在左栏底部「设置」切换务实或风趣讲解，登录后可改昵称与研究简介。

## 实现与范围

- PDF.js 和 Mammoth 在浏览器提取文字，保留 PDF 页号或文字段号。标题识别采用 Markdown 标题、常见中英文节名及带分隔符的编号标题。无可识别标题时在「全文」项内阅读。长节分批讲解，目录仍显示一个小节。24 MB 以内的 PDF 可逐页处理，扫描页目前需要预先 OCR。可打开 PDF 原版核对公式、图表和双栏版式。
- 工学侧重设计取舍和实验基线，理学侧重假设、推导和测量，文学侧重文本细读与论证，经济学侧重识别策略，教育学侧重干预与评估，自定义学科可随项目传入。新生成或重新生成的讲解采用当前讲解偏好。
- Node 服务校验讲解结构、动机、结果，以及引用文字是否逐字出现在对应片段。对比至少引用两篇论文各一处。语义准确和证据充分性仍需读者复核。
- PDF 原版以页面形式在阅读区渲染。Word 预览保留可转换的段落、标题、表格与图片，精确分页请下载原件。PDF 文字层提供划选和引文标记。
- 阅读历史、原始文件、最近小节和已生成讲解保存在当前浏览器的 IndexedDB。账号与项目元数据保存在服务端 SQLite。论文原件、阅读进度及勾选记住的模型信息按账号保存在当前浏览器，清理网站数据会清除本地记录。学习库的原版按需从 arXiv、Digital Humanities Quarterly 或论文出版方获取，并缓存在服务端 `.data/library/`。首次使用会按需创建运行数据目录。
- 全文生成会逐节发送提取文字给所选模型。文献发现使用题名和论文开头提炼检索词，优先查询 Crossref，缺少摘要时尝试用 Semantic Scholar 补齐，并可使用本地收录资料补充候选。字段明确标注题名或摘要来源，只在元数据支持时标为引用关系。领域位置是基于该批候选的分析。

```powershell
npm test
npm run build
npm run preview -- --port 5174
```

Vite 开发和预览服务都接入辅助 API。公网部署需提供相应的服务端运行环境。

学习库的预生成讲解保存在 `study-guides/`，包括各小节原文引文和全文回顾。更新论文版本后，可使用服务端模型对已有的本地原版缓存重新生成：

```powershell
node scripts/prepare-study-guides.mjs
```

可在命令末尾指定一个或多个论文 ID。任务从 `.data/guide-jobs/` 保存的进度继续，完整讲解写入 `study-guides/`。如需使用本机兼容模型，设置 `ATLAS_GUIDE_LOCAL_BASE` 为本机的 `http://127.0.0.1:端口/v1`，并设置 `ATLAS_GUIDE_MODEL` 为模型 ID。学习库会显示每篇的可读状态。

使用其他兼容 Chat Completions 的云接口时，在本地环境同时设置 `ATLAS_GUIDE_API_BASE`、`ATLAS_GUIDE_API_KEY` 和 `ATLAS_GUIDE_MODEL`，再运行同一命令。可以将配置存入 Git 忽略的 `.data/guide-provider.env`，用 `node --env-file=.data/guide-provider.env scripts/prepare-study-guides.mjs` 启动。

设置 `ATLAS_GUIDE_AUDIT=1` 后运行同一命令，可核对每篇的分段覆盖、讲解字段和原文引文，无需连接模型。

## 开源组件与对标

- 文档提取复用 [Mozilla PDF.js](https://github.com/mozilla/pdf.js) 和 [Mammoth.js](https://github.com/mwilliamson/mammoth.js)。
- 界面按 [ECC frontend-design-direction](https://github.com/affaan-m/ECC/tree/main/skills/frontend-design-direction) 设计。
- 上传控件参考 [Itskrish01 的层叠上传图标](https://uiverse.io/Itskrish01/chatty-lionfish-23)，生成反馈参考 [barisdogansutcu 的圆环加载器](https://uiverse.io/barisdogansutcu/light-rat-32)。两处交互按阅读工作台的视觉和键盘操作重新实现。
- 证据就地呈现参考 [ScholarPhi](https://scholarphi.org/)；同类工作台对标 [Trace Research Paper Studio](https://github.com/Ahmet-Ruchan/trace-research-paper-studio)。
- 实时引用数据来自 [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)。

## 技术架构

浏览器端采用 React、TypeScript 和 Vite，负责文档导入、原文显示及阅读交互。Node.js 提供模型调用、文献检索和账号 API，使用 SQLite 存储服务端数据，浏览器本地阅读数据使用 IndexedDB。

## 提交与配置

评审运行时将 `.env.example` 复制为 `.env.local`，填写自己的密钥。也可在启动进程前直接设置同名环境变量。模型与书目服务的访问取决于运行环境的网络配置。不要把填写后的配置、浏览器数据或运行时数据推送至仓库。

项目维护者为 Paper Atlas 项目组。本提交版的 Git 记录使用项目组身份。正式报名团队信息以竞赛系统登记为准。
