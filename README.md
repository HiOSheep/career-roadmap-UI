# Evidence-Driven Career Planner UI

一个可复用的职业规划网页框架。它保留原项目的三维档案阵列与交互外壳，并将个人资料、市场证据、路线图和求职材料留为空白工作表。示例数据不代表任何人的经历；在添加本人材料前，不应把待填写项当成事实或成果。

## 结构

- `evidence-driven-career-planner/SKILL.md`：职业规划流程、证据标准与交付要求。
- `docs/career-roadmap-context.md`：个人背景、约束、经历与市场调研的输入工作表。
- `docs/职业发展路线图.md`：依据 Skill 填写的最终交付模板。
- `public/职业发展路线图.md`：网页可打开的空白模板副本。
- `src/career-roadmap.ts`：网页中的空白画像、三赛道、12 个月计划、里程碑、取舍、风险、决策门和职业材料区块。
- `content/archives.json`：为既有档案内容校验保留的空白条目结构，不是个人经历或市场证据。
- `content/albums.json`、`content/album-audio.json`：专辑/播放列表功能的数据接口，初始状态为空。

## 使用 Skill 与隐私

完善路线图前，请先阅读仓库内的 `evidence-driven-career-planner/SKILL.md`，按其中的流程补充背景资料、证据和规划内容。身份证件号码、联系方式、住址、账号凭据及未公开的雇主或项目资料等敏感信息，不要上传到云端服务或公开仓库。使用云端工具前请先脱敏，并只提供完成任务所需的最少信息。

## 本地运行

安装依赖：`npm ci`。启动：`npm run dev`。构建静态网页：`npm run build`。内容校验：`npm run check:content`。内容改动后可运行 `npm run export:archives` 更新下载模板。模型、面板、光盘、画质与网页交互检查命令见 `package.json`。

## 保留的界面能力

页面继续提供三维场景、开场动效、档案浏览、详情与解密过渡、模型查看器、检索与收藏、音效、主题、画质、动效偏好、手柄控制和响应式布局。专辑播放模块保留空数据接口。若要启用曲目，请自行下载专辑封面和音源并保存到对应资源目录，再补充专辑资料；请先确认授权范围，并保留来源与署名。本仓库不提供专辑封面或音源。

## 来源与许可

本项目基于 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) 的代码与资源改编。感谢原作者和贡献者提供的 UI、交互、模型、开场、解密动效、音效及工程基础。保留原项目 MIT `LICENSE`。

项目作者有权授权的代码、文档、模型和原创音视频素材按根目录 MIT 授权；《明日方舟》及莱茵生命相关内容、MiSans、Novecento 和其他第三方素材按各自权利与许可处理，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及素材目录说明。单独授权的 Novecento 字体包不进入 Git。为模板添加素材前，请先核实授权范围并保留署名与来源。

网页构建成功只表示静态资源可以生成，不代表真实浏览器中的视觉、交互或外部市场资料已经验收。
