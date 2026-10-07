import { escapeHtml } from "./html";

export type CareerMonth = {
  id: string;
  label: string;
  phase: string;
  summary: string;
  action: string;
  deliverable: string;
  acceptance: string;
  validator: string;
  effort: string;
  milestone?: string;
};

const months = Array.from({ length: 12 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    id: `month-${number}`,
    label: `MONTH ${number}`,
    phase: "MONTHLY PLAN",
    summary: "核心问题：待填写",
    action: "行动：待填写",
    deliverable: "待填写；注明交付形式和可查阅位置。",
    acceptance: "待填写；写出可观察、可复核的验收条件。",
    validator: "待填写；指定外部验证者或验证方法。",
    effort: "待填写；估算本月投入。",
  } satisfies CareerMonth;
});

export const careerRoadmapMonths: CareerMonth[] = months;

const strengths = Array.from({ length: 3 }, (_, index) => [
  `S${index + 1}`,
  "优势：待填写",
  "事实证据：待填写；当前边界或反证：待填写。",
]);
const gaps = Array.from({ length: 2 }, (_, index) => [
  `G${index + 1}`,
  "优先缺口：待填写",
  "证据：待填写；与目标的关系：待填写。",
]);

const tracks = Array.from({ length: 3 }, (_, index) => ({
  code: String.fromCharCode(65 + index),
  role: `候选方向 ${String.fromCharCode(65 + index)}：待填写`,
  tag: "待确定",
  demand: "待核实；记录具体岗位样本、日期和范围。",
  competition: "待核实；不得把少量职位样本写成行业平均。",
  ai: "待分析：AI-native / AI 应用 / AI 辅助 / 无显著要求。",
  supply: "待核实；注明可比口径。",
  typicalSalary: "待核实；注明币种、地区、日期、来源和统计口径。",
  salarySample: "待核实；保留原始岗位样本及限制。",
  duties: "待填写：典型职责。",
  requirements: "待填写：学历与专业要求。",
  skillsTools: "待填写：核心技能与常用工具。",
  portfolio: "待填写：作品 / 项目要求。",
  location: "待填写：招聘地区分布。",
  barrier: "待填写：进入门槛及其证据。",
  overlap: "待填写：与现有经历相关的事实证据。",
  gap: "待填写：能力差距及依据。",
}));

const milestones = Array.from({ length: 3 }, (_, index) => ({
  code: `M${index + 1}`,
  date: "日期：待填写",
  state: "状态变化：待填写",
  evidence: "具体证据：待填写",
  acceptance: "验收条件：待填写",
}));
const tradeoffs = Array.from({ length: 3 }, () => ({
  title: "暂不优先事项：待填写",
  reason: "原因：待填写",
  benefit: "获得的收益：待填写",
  cost: "接受的机会成本：待填写",
}));
const risks = Array.from({ length: 3 }, (_, index) => ({
  code: `R${index + 1}`,
  risk: "风险：待填写",
  warning: "早期信号：待填写",
  impact: "影响：待填写",
  trigger: "调整触发点：待填写",
  planB: "Plan B：待填写",
}));
const gates = Array.from({ length: 2 }, (_, index) => ({
  code: `GATE ${String.fromCharCode(65 + index)}`,
  question: "待填写：需要作出的决定",
  evidence: "待填写：决定前需要收集的证据",
  pathA: "待填写：支持路径 A 的证据",
  pathB: "待填写：支持路径 B 的证据",
  revisit: "复查日期：待填写",
}));
const interviews = Array.from({ length: 10 }, (_, index) => [
  `Q${index + 1}`,
  "面试问题：待填写",
  "考察点与回答结构：待填写",
  "可能追问及真正需要掌握的内容：待填写",
]);

export function careerMonthMarkup(month: CareerMonth) {
  return `<div class="career-month-kicker"><span>${escapeHtml(month.phase)}</span><b>${escapeHtml(month.label)}</b></div><h3>${escapeHtml(month.action)}</h3><p>${escapeHtml(month.summary)}</p><div class="career-detail-grid"><div><span>ACTION OUTPUT</span><p>${escapeHtml(month.deliverable)}</p></div><div><span>ACCEPTANCE TEST</span><p>${escapeHtml(month.acceptance)}</p></div><div><span>VALIDATOR</span><p>${escapeHtml(month.validator)}</p></div><div><span>EFFORT</span><p>${escapeHtml(month.effort)}</p></div></div>${month.milestone ? `<div class="career-milestone"><span>${escapeHtml(month.milestone)}</span></div>` : ""}`;
}

function capabilityMarkup() {
  return `<section class="career-capability">
    <div class="career-section-head"><span>01 / PERSONAL CAPABILITY PROFILE</span><h3>当前有哪些可验证的能力证据？</h3><p>从已发生的经历出发；证据不足时保留“待验证”。</p></div>
    <div class="career-capability-grid">
      <div><span class="career-label">3 STRENGTHS / 优势</span>${strengths.map(([code, title, body]) => `<article class="career-capability-card"><b>${code}</b><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></article>`).join("")}</div>
      <div><span class="career-label">2 PRIORITY GAPS / 缺口</span>${gaps.map(([code, title, body]) => `<article class="career-capability-card gap"><b>${code}</b><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></article>`).join("")}</div>
    </div>
    <div class="career-positioning"><span>POSITIONING / 定位</span><p>当前阶段、长期方向与现实的近期入口：待填写。</p><strong>目标状态 → 当前状态 → 最大差距：待填写。</strong></div>
  </section>`;
}

function competitionMarkup() {
  return `<section class="career-competition">
    <div class="career-section-head"><span>02 / THREE-TRACK COMPETITION MAP</span><h3>比较三个真实且可比的「行业 × 岗位」方向。</h3><p>记录来源、日期、范围和限制；样本不等于行业平均。</p></div>
    <div class="career-track-cards">${tracks.map(track => `<article class="career-track-card"><div class="career-track-code"><b>${track.code}</b><span>${escapeHtml(track.tag)}</span></div><h4>${escapeHtml(track.role)}</h4><dl><div><dt>MARKET DEMAND</dt><dd>${escapeHtml(track.demand)}</dd></div><div><dt>COMPETITION</dt><dd>${escapeHtml(track.competition)}</dd></div><div><dt>AI ROLE</dt><dd>${escapeHtml(track.ai)}</dd></div><div><dt>TALENT SUPPLY</dt><dd>${escapeHtml(track.supply)}</dd></div><div><dt>SALARY SAMPLES</dt><dd>${escapeHtml(track.typicalSalary)} ${escapeHtml(track.salarySample)}</dd></div><div><dt>RESPONSIBILITIES</dt><dd>${escapeHtml(track.duties)}</dd></div><div><dt>EDUCATION / MAJOR</dt><dd>${escapeHtml(track.requirements)}</dd></div><div><dt>SKILLS / TOOLS</dt><dd>${escapeHtml(track.skillsTools)}</dd></div><div><dt>PORTFOLIO</dt><dd>${escapeHtml(track.portfolio)}</dd></div><div><dt>LOCATION</dt><dd>${escapeHtml(track.location)}</dd></div><div><dt>ENTRY BARRIERS</dt><dd>${escapeHtml(track.barrier)}</dd></div><div><dt>CURRENT EVIDENCE</dt><dd>${escapeHtml(track.overlap)}</dd></div><div><dt>GAPS</dt><dd>${escapeHtml(track.gap)}</dd></div></dl></article>`).join("")}</div>
    <div class="career-insight-grid"><article><span>NEAR-TERM ENTRY</span><h4>待填写</h4><p>主攻入口及证据：待填写。</p></article><article><span>BACKUP TRACK</span><h4>待填写</h4><p>备选方向及切换条件：待填写。</p></article><article><span>LONG-TERM OBSERVATION</span><h4>待填写</h4><p>长期观察方向及仍未知的信息：待填写。</p></article></div>
  </section>`;
}

function milestoneMarkup() {
  return `<section class="career-milestones">
    <div class="career-section-head"><span>03 / MILESTONES</span><h3>三个里程碑</h3><p>写明状态变化、具体证据和验收条件。</p></div>
    <div class="career-milestone-grid">${milestones.map(item => `<article><b>${item.code}</b><span>${escapeHtml(item.date)}</span><h4>${escapeHtml(item.state)}</h4><p>${escapeHtml(item.evidence)}</p><small>${escapeHtml(item.acceptance)}</small></article>`).join("")}</div>
  </section>`;
}

function tradeoffMarkup() {
  return `<section class="career-tradeoffs">
    <div class="career-section-head"><span>05 / TRADE-OFFS</span><h3>取舍与机会成本</h3><p>至少写明三项暂不优先的事项及其代价。</p></div>
    <div class="career-tradeoff-grid">${tradeoffs.map((item, index) => `<article><b>0${index + 1}</b><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.reason)}</p><p>${escapeHtml(item.benefit)}</p><p>${escapeHtml(item.cost)}</p></article>`).join("")}</div>
  </section>`;
}

function riskMarkup() {
  return `<section class="career-risks">
    <div class="career-section-head"><span>06 / RISKS & PLAN B</span><h3>三个主要风险与备用路径</h3><p>为每个风险预先定义观察信号和调整触发点。</p></div>
    <div class="career-risk-grid">${risks.map(item => `<article><b>${item.code}</b><h4>${escapeHtml(item.risk)}</h4><p><strong>Warning</strong> ${escapeHtml(item.warning)}</p><p><strong>Impact</strong> ${escapeHtml(item.impact)}</p><p><strong>Trigger</strong> ${escapeHtml(item.trigger)}</p><p><strong>Plan B</strong> ${escapeHtml(item.planB)}</p></article>`).join("")}</div>
  </section>`;
}

function decisionMarkup() {
  return `<section class="career-gates"><div><span class="career-label">DECISION GATES / 决策门</span>${gates.map(item => `<article><p><b>${item.code} / ${escapeHtml(item.question)}</b></p><p>${escapeHtml(item.evidence)}</p><p>${escapeHtml(item.pathA)}</p><p>${escapeHtml(item.pathB)}</p><p>${escapeHtml(item.revisit)}</p></article>`).join("")}</div></section>`;
}

function resumeMarkup() {
  return `<section class="career-materials">
    <div class="career-section-head"><span>08 / CAREER MATERIALS</span><h3>简历与作品集建议</h3><p>只使用真实经历，并区分个人、团队与 AI / 自动化贡献。</p></div>
    <div class="career-material-grid"><article><span>EMPHASIZE</span><h4>突出哪些经历</h4><p>待填写：依据目标岗位与证据决定。</p></article><article><span>SHORTEN</span><h4>缩短哪些经历</h4><p>待填写：说明原因。</p></article><article><span>EVIDENCE GAPS</span><h4>还缺哪些证据</h4><p>待填写：未来通过项目创造，不补造指标。</p></article><article><span>CONTRIBUTION</span><h4>贡献边界</h4><p>待填写：本人、团队、AI / 自动化分别完成什么。</p></article></div>
  </section>`;
}

function interviewMarkup() {
  return `<section class="career-interviews">
    <div class="career-section-head"><span>09 / INTERVIEW SET</span><h3>约十道岗位相关问题</h3><p>根据目标岗位、真实项目与已发现的薄弱点填写。</p></div>
    <div class="career-interview-list">${interviews.map(([code, question, answer, follow]) => `<details class="career-interview-item"><summary><b>${escapeHtml(code)}</b><span>${escapeHtml(question)}</span></summary><div><p><strong>考察点 / 回答结构</strong>${escapeHtml(answer)}</p><p><strong>追问 / 真正需要掌握的内容</strong>${escapeHtml(follow)}</p></div></details>`).join("")}</div>
  </section>`;
}

function sourceMarkup() {
  return `<section class="career-sources"><span class="career-label">10 / SOURCE LEDGER · 来源台账</span><p>每项市场结论应记录来源、日期、范围、指标口径和限制。没有可靠来源时标为“待核实”。</p><div class="career-source-placeholder"><span>来源：待填写</span><span>日期 / 范围：待填写</span><span>口径 / 限制：待填写</span></div></section>`;
}

function retrospectiveMarkup() {
  return `<section class="career-skill"><div><span class="career-label">SKILL RETROSPECTIVE / Skill 复盘</span><h3>待填写</h3><p>哪些方法有效：待填写。</p><p>哪些问题仍不确定、下一轮应改进什么：待填写。</p></div><div class="career-skill-links"><a href="职业发展路线图.md" target="_blank" rel="noopener">OPEN BLANK WORKSHEET ↗</a><a href="evidence-driven-career-planner/SKILL.md" target="_blank" rel="noopener">OPEN SKILL.md ↗</a></div></section>`;
}

export function careerRoadmapMarkup() {
  const active = careerRoadmapMonths[0];
  return `<div class="career-roadmap">
    <header class="career-head"><div><span class="career-eyebrow">EVIDENCE-DRIVEN CAREER DEVELOPMENT</span><h2>12M CAREER ROUTE<small>空白工作表 · 周期待填写</small></h2><p>从真实经历与外部证据开始，比较可行路径，制定可验收行动，并随新证据更新判断。</p></div><div class="career-status"><b>个人资料：待填写</b><span>事实、分析、假设与计划分开记录</span></div></header>
    ${capabilityMarkup()}
    ${competitionMarkup()}
    ${milestoneMarkup()}
    <section class="career-roadmap-core">
      <div class="career-section-head"><span>04 / 12-MONTH ROADMAP</span><h3>十二个月度工作表</h3><p>每个月填写核心问题、行动、交付物、验收条件、预计投入和验证者。</p></div>
      <section class="career-profile"><div class="career-profile-main"><span class="career-label">12-MONTH OBJECTIVE</span><strong>目标状态：待填写</strong><p>当前状态、目标状态与主要差距：待填写。不要把不可控的 Offer 等结果作为必达里程碑。</p></div><div class="career-track-list"><span class="career-label">ROUTE CHECKPOINTS</span><ol><li><b>01</b><span>个人证据<small>待安排</small></span></li><li><b>02</b><span>市场调研<small>待安排</small></span></li><li><b>03</b><span>可验证交付<small>待安排</small></span></li><li><b>04</b><span>复盘与决策<small>待安排</small></span></li></ol></div></section>
      <section class="career-signal-grid"><div><span class="career-label">EVIDENCE</span><p>事实须能追溯到来源。</p><p>结论注明边界与反证。</p></div><div><span class="career-label">CONTRIBUTION</span><p>分别记录本人、团队和 AI / 自动化贡献。</p><p>失败与未验证项也保留。</p></div><div><span class="career-label">EXECUTION</span><p>行动有交付物与验收条件。</p><p>投入与验证方法均待填写。</p></div></section>
      <section class="career-timeline"><div class="career-label">MONTHLY CONTROL BOARD / 点击月份读取工作表</div><div class="career-months" role="tablist" aria-label="12个月路线"><div class="career-month-grid">${careerRoadmapMonths.map((month, index) => `<button type="button" role="tab" aria-selected="${index === 0}" data-career-month="${month.id}" class="${index === 0 ? "active" : ""}"><span>${month.label.slice(6)}</span><small>待填写</small></button>`).join("")}</div><article id="career-month-detail" class="career-month-detail" role="tabpanel">${careerMonthMarkup(active)}</article></div></section>
    </section>
    ${tradeoffMarkup()}
    ${riskMarkup()}
    ${decisionMarkup()}
    ${resumeMarkup()}
    ${interviewMarkup()}
    ${sourceMarkup()}
    ${retrospectiveMarkup()}
  </div>`;
}
