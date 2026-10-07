# 第三方代码与素材声明

本文件简要标明仓库内容的来源和许可范围；它不替代任何许可证或权利人授权。

## 项目代码与自有素材

本项目基于 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI)。根目录 `LICENSE` 中的 MIT License 分别适用于相应版权人有权授权的内容：LBEILC 授权的上游代码与素材，以及仓库所有者 HiOSheep 在本仓库创作并有权授权的原创补充。对应版权署名分别为 `Copyright (c) 2026 LBEILC` 和 `Copyright (c) 2026 HiOSheep`。HiOSheep 的原创补充包括本仓库的 Skill、职业规划文档、模板文案及其创作的代码与素材。

再分发时请保留根目录 `LICENSE` 和 README 中的上游来源说明。对模型等素材的许可仅覆盖作者有权授权的部分。

## 《明日方舟》及莱茵生命相关内容

《明日方舟》及莱茵生命相关名称、标志、设定、原作视觉设计和原片内容的权利归各自权利人，不纳入本项目 MIT 授权。本项目不能代替权利人授予这些权利；这些内容在模型、界面或演示材料中的呈现也不因此获得授权。

`public/audio/typing-preview.wav`、`public/audio/typing-source.json`、`src/typing-samples.ts`、`reference/typing-original.wav` 和 `scripts/extract-typing-audio.mjs` 涉及原 PV 短音及其衍生片段。来源和处理记录见 `public/audio/README.md`；这些片段不受项目 MIT 授权，继续遵循原权利人的权利要求。

## 其他第三方素材

- **MiSans：** `public/fonts/misans-webfont-4.3.1/` 中的字体文件遵循小米 MiSans 字体许可，版权和许可文本见 `public/fonts/MiSans-license.pdf`、`public/fonts/NOTICE.txt`。应用嵌入及字体文件的分发均须遵守该许可；字体本身不纳入项目 MIT。`misans-webfont` 项目的 Apache-2.0 许可只适用于其自身项目，不替代字体许可。
- **Novecento Sans Wide：** 开场固定字形的来源和使用依据见 `public/assets/boot-lettering-notice.txt`。字体文件和可选 MyFonts 网页字体包不随仓库分发；字体许可不涵盖 RHINE LAB 名称或原作内容。
- **Rolling Number 与 npm 依赖：** 各自遵循原有许可证。Rolling Number 的 MIT 文本见 `public/licenses/rolling-number.txt`；依赖版本记录在 `package-lock.json`。

## 用户自行添加的专辑素材

模板中的 `public/album-covers/` 与 `public/album-audio/` 是空白接口。用户添加的专辑封面和音源不受本项目许可证授权；添加者应自行确认授权并保留来源与署名。
