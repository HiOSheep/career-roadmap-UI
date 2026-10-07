import { createRollingClock } from "./rolling-clock";
import { InspectionOverlay } from "./inspection-overlay";
import { DocumentDecryption } from "./document-decryption";
import "./document-decryption.css";
import "./decryption.css";
import { escapeHtml } from "./html";
import { normalizeQuality, superPerformanceQuality, qualityPresets, type QualityPreset, type RenderQuality } from "./render-quality";
import { qualityMarkup, syncQualityUI } from "./quality-settings";
import "@kitlangton/rolling-number/styles.css";
import "./style.css";
import "./pointer-cursor";
import "./quality-settings.css";
import "./responsive.css";
import { viewportLayout, openingLayout } from "./viewport-layout";
import { assetUrl } from "./asset-url";
import { createRollingNumber, createRollingText } from "@kitlangton/rolling-number";
import { ArchiveScene } from "./scene";
import { ModelViewer } from "./model-viewer";
import { ContentTransition, SurfaceTransition } from "./ui-transitions";
import { BootSequence } from "./boot";
import { loadBootWebfonts } from "./boot-lettering";
import { wrap, type ArchiveNavigation } from "./archive-loop";
import {
  records,
  categories,
  archiveColumns,
  columnFiles,
  fileLocation,
} from "./data";
import { TerminalAudio } from "./audio";
import { audioSettingsMarkup } from "./audio-settings";
import {
  createMotionPreferences,
  fullMotion,
  motionEnabled,
  motionPresetFor,
  motionSettingsMarkup,
  motionSummary,
  reducedMotion,
  type MotionKey,
  type MotionPreset,
  type StoredMotion,
} from "./motion-preferences";
import { StartupGate } from "./startup";
import { CINEMATIC_HANDOFF } from "./motion";
import { createGamepadBridge, resolveScrollTarget, type GamepadBridge } from "./gamepad";
import { gamepadSettingsMarkup } from "./gamepad-settings";
import { RuntimeReport } from "./runtime-report";
import "./startup.css";
import { paintTheme, themeSettingsMarkup } from "./theme-ui";
import { careerMonthMarkup, careerRoadmapMarkup, careerRoadmapMonths } from "./career-roadmap";
import "./career-roadmap.css";
import { albumForMonth, albumTrackMarkup, albumDescriptionMarkup } from "./albums";
import "./albums.css";
import { DiscControls } from "./disc-controls";
import { AlbumPlayer } from "./album-player";
import { FrameProfile } from "./frame-profile";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
import { logo, brandHeading } from "./brand";

$("#stage").innerHTML = `
  <div id="three-scene" class="three-scene"></div>
  <div class="scene-atmosphere archive-atmosphere"></div>
  <div id="boot-background" class="boot-background"><svg viewBox="0 0 1920 1080" preserveAspectRatio="none"><g fill="none" stroke="#fff" stroke-width="3"><path d="M-210 705C-45 705 182 704 247 567C337 377 99 306 4 435S27 680 169 631C309 584 227 314 279 111S568-113 568-113"/><path d="M1560-80C1374 114 1671 168 1601 323S1371 367 1431 480S1692 666 1559 787S1329 886 1498 1130"/><circle cx="1450" cy="648" r="346"/><circle cx="1450" cy="648" r="348"/></g></svg></div>
  <header class="brand">${brandHeading}</header>
  <nav class="system-nav" aria-label="系统导航">
    <button data-action="career" aria-label="打开 12 个月路线图" title="12 个月路线图"><span class="nav-glyph">⌕</span> 12M ROADMAP</button>
    <button class="settings-button" data-action="settings" aria-label="系统设置" title="系统设置"><span class="settings-glyph" aria-hidden="true">◷</span><span class="settings-label">SETTING</span></button>
  </nav>
  <button id="skip" class="skip" data-action="skip">ENTER SYSTEM <span>↗</span></button>
  <section id="boot" class="boot" aria-label="系统启动">
    <div class="access-text">ACCESS</div>
    <div class="boot-logo">${logo}</div>
    <div class="auth-status"><span>▪</span> <span id="auth-message"></span><i></i></div>
    <div class="scan"><svg viewBox="0 0 1920 1080" aria-hidden="true"><g fill="none" stroke="#080a08" stroke-width="2" stroke-linecap="round"><path/><path stroke="#fff"/><path/><path/><path/><path/><circle class="orbit-dot" r="8" fill="#ed821b" stroke="none"/><circle class="orbit-dot" r="8" fill="#ed821b" stroke="none"/><circle class="scan-core" cx="960" cy="540" r="5" fill="#080a08" stroke="none"/></g></svg><span>PERMISSION AUTHORIZED</span></div>
    <div class="welcome"><div class="welcome-panel"></div><div class="welcome-heading">WELCOME TO</div><div class="welcome-company"><strong>CAREER PLANNER</strong><strong class="welcome-highlight" aria-hidden="true">CAREER PLANNER</strong></div><div class="welcome-database">PLANNING WORKSPACE</div><div class="welcome-logo">${logo}</div></div>
  </section>
  <svg id="inspection-marks" viewBox="0 0 1920 1080" aria-hidden="true"><path id="inspection-lines"/><g id="inspection-corners"></g><circle id="inspection-point" r="1.8"/></svg>
  <div id="inspection-text" aria-hidden="true">本月计划<strong>${escapeHtml(careerRoadmapMonths[0].summary)}</strong></div>
  <section id="archive-ui" class="archive-ui" aria-label="12个月路线图选择">
    <div class="archive-callout"><div class="eyebrow">EVIDENCE-LED CAREER PLANNING <span>／</span> <span id="archive-category">12-MONTH ROADMAP</span></div><button class="file-title" data-action="open">MONTH <span id="selected-id"><span id="selected-code"></span></span><span class="file-open">↗</span></button><div class="callout-rule"><i></i></div><div class="file-summary"><span id="selected-title">ROADMAP ENTRY</span><span id="selected-clearance">DRAFT · NOT VERIFIED</span></div><button class="read-file" data-action="open">OPEN ROADMAP <span>→</span></button></div>
    <div id="hover-label" class="hover-label" hidden>MONTH <span id="hover-code">01</span> / <span id="hover-title"></span></div>
    <div class="archive-counter"><span class="tiny-label">ROADMAP / SELECT</span><div><span id="selected-number">01</span><i>/</i><span class="count-total">12</span></div></div>
    <div class="archive-navigation"><button data-action="prev" aria-label="上一个月">↑</button><div id="file-ticks" class="file-ticks"></div><button data-action="next" aria-label="下一个月">↓</button></div>
    <div class="column-navigation"><button data-action="column-prev" aria-label="上一阶段">←</button><div><span id="column-number">PHASE <span id="column-index">01</span> / 04</span><strong id="column-name">12-MONTH ROADMAP</strong></div><button data-action="column-next" aria-label="下一阶段">→</button></div>
    <div class="archive-hint"><kbd>←</kbd> <kbd>→</kbd> 切换阶段 <span>／</span> <kbd>↑</kbd> <kbd>↓</kbd> 前后月份 <span>／</span> <kbd>ENTER</kbd> 查看计划</div>
  </section>
  <section id="detail-ui" class="detail-ui" aria-label="档案内容" hidden>
    <button class="back-button" data-action="back">← <span>12M ROADMAP</span><small>ESC</small></button>
    <div class="object-caption"><span id="object-id">MONTH 01</span><div>CAREER DEVELOPMENT</div><small>MONTHLY CONTROL BOARD <span>↔</span></small></div>
    <div class="detail-model-actions" role="group" aria-label="CD 盒与歌词本"><button data-action="model-viewer">查看 CD 盒 <span>360° ↗</span></button><button data-action="booklet">打开歌词本 <span>↗</span></button></div>
    <article id="detail-content" class="detail-content"></article>
  </section>
  <div class="powered">BUILT ON <b>EVIDENCE</b><i></i></div>
  <footer class="system-footer"><span><i class="status-light"></i> PLANNER READY</span><span>CAREER PLANNER <i>／</i> <span id="clock">00:00:00</span></span><button data-action="replay" title="重播启动流程">REINITIALIZE ↗</button></footer>
  <div id="modal-root"></div><div id="toast" class="toast" role="status"></div>
  <div id="loading" class="loading"><div class="loading-mark">${logo}</div><span>LOADING CAREER WORKSHEETS</span><i></i></div>
`;

$("#boot-background").insertAdjacentHTML(
  "beforeend",
  '<div class="boot-white"></div>',
);
const bootSequence = new BootSequence($("#stage"));
$("#viewport").insertAdjacentHTML("beforeend", '<button class="mobile-entry" data-action="skip">进入档案 <span>→</span></button>');

type Mode = "boot" | "archive" | "detail";
let mode: Mode = "boot",
  selected = 0,
  bootStart = 0,
  lastStep = "",
  ready = false;
let modal: "search" | "saved" | "settings" | "career" | "booklet" | null = null,
  searchQuery = "",
  filter = "全部档案";
let activeTab = "overview";
const reviewParams = new URLSearchParams(location.search);
let frozenTime =
  reviewParams.get("freeze") === "1"
    ? Number(reviewParams.get("time") ?? 0)
    : null;
if (reviewParams.get("review") === "1") {
  $("#stage").dataset.review = "true";
  window.addEventListener("message", (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== window.parent ||
      event.data?.type !== "rhine-review-frame"
    )
      return;
    const t = Number(event.data.time);
    if (!Number.isFinite(t) || t < 0 || t >= 35) return;
    frozenTime = t;
    if (ready && mode !== "boot") setMode("boot");
  });
}
let toastTimer: ReturnType<typeof setTimeout>;
let previousFocus: HTMLElement | null = null;
const detailTransition = new SurfaceTransition($("#detail-ui"), undefined, 180, 180);
const tabTransition = new ContentTransition();
let modalTransition: SurfaceTransition | undefined;
let modalClosing = false;
let modalSiblings: { node: HTMLElement; inert: boolean }[] = [];
let pendingDetailFocus = false;
let bookmarkFeedback: Animation | undefined;
function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
const saved = new Set<string>(readLocal<string[]>("rhine-saved", []));
const storedPrefs = readLocal<Partial<{ sound: boolean; music: boolean; soundVolume: number; musicVolume: number; reduced: boolean; quality: boolean; rendering: RenderQuality; superPerformance: boolean; colorTheme: "light" | "dark"; motion: StoredMotion; motionPreset: MotionPreset; gamepad: boolean; gamepadRumble: boolean }>>("rhine-settings", {});
const initialMotion = createMotionPreferences(
  storedPrefs.motion,
  storedPrefs.reduced ?? (storedPrefs.motion === undefined
    ? matchMedia("(prefers-reduced-motion: reduce)").matches
    : undefined),
);
const initialMotionPreset = motionPresetFor(initialMotion);
const prefs = {
  sound: storedPrefs.sound ?? true,
  music: storedPrefs.music ?? storedPrefs.sound ?? true,
  soundVolume: storedPrefs.soundVolume ?? .55,
  musicVolume: storedPrefs.musicVolume ?? .5,
  motion: initialMotion,
  motionPreset: initialMotionPreset,
  quality: storedPrefs.quality ?? true,
  superPerformance: storedPrefs.superPerformance ?? false,
  rendering: normalizeQuality(storedPrefs.rendering ??
    (storedPrefs.quality === undefined ? { ...qualityPresets.performance, resolution: "native" } : undefined),
    storedPrefs.quality !== false),
  colorTheme: storedPrefs.colorTheme === "dark" ? "dark" : "light",
  // Controller support is on by default: it is additive, and a pad that is not
  // there costs one polled frame per animation frame.
  gamepad: storedPrefs.gamepad ?? true,
  gamepadRumble: storedPrefs.gamepadRumble ?? true,
};
const motionActive = (key: MotionKey) => motionEnabled(prefs.motion, key);
if (reviewParams.has("profile")) {
  prefs.rendering = { ...qualityPresets.performance, resolution: "2160p" };
  prefs.superPerformance = false;
  if (reviewParams.get("probe") === "no-shadows") prefs.rendering.shadows = 0;
  prefs.motion = fullMotion();
  prefs.sound = prefs.music = false;
}
const motionIsReduced = () => Object.values(prefs.motion).every((value) => !value);
paintTheme(prefs.colorTheme === "dark" ? 1 : 0);
const rollingMotion = {
  duration: 460,
  motionBlur: true,
  animated: motionActive("rollingNumbers"),
};
const updateFooterClock = createRollingClock($("#clock"));
const numberOptions = {
  ...rollingMotion,
  locales: "en-US",
  format: { minimumIntegerDigits: 2, useGrouping: false },
};
const fileCounter = createRollingNumber($("#selected-number"), {
  ...numberOptions,
  value: 1,
});
const columnCounter = createRollingNumber($("#column-index"), {
  ...numberOptions,
  value: 3,
});
const monthCodeOptions = {
  ...numberOptions,
  format: { minimumIntegerDigits: 2, useGrouping: false },
  value: 1,
};
const textOptions = {
  ...rollingMotion,
  animated: motionActive("rollingText"),
  transition: "direct" as const,
  stagger: "none" as const,
};
const selectionTitle = createRollingText($("#selected-title"), {
  ...textOptions,
  text: $("#selected-title").textContent ?? "",
});
const columnTitle = createRollingText($("#column-name"), {
  ...textOptions,
  text: $("#column-name").textContent ?? "",
});
// The hover label re-rolls on every cell the pointer crosses, and motion blur
// costs one CPU-painted SVG filter per animating glyph: sweeping the shelf spent
// more time in those filters and the layout they dirty than in the whole scene
// update. Keep the roll, drop the smear where it is redrawn most.
const hoverTextMotion = { ...textOptions, motionBlur: false };
const hoverTitleElement = $("#hover-title");
const hoverTitle = createRollingText(hoverTitleElement, { ...hoverTextMotion, text: "" });
const categoryTitle = createRollingText($("#archive-category"), {
  ...textOptions,
  text: $("#archive-category").textContent ?? "",
});
const clearanceTitle = createRollingText($("#selected-clearance"), {
  ...textOptions,
  text: $("#selected-clearance").textContent ?? "",
});
const selectedCode = createRollingText($("#selected-code"), { ...textOptions, text: "01" });
const rollingTitles = [selectionTitle, columnTitle, hoverTitle, categoryTitle, clearanceTitle, selectedCode];
const hoverCode = createRollingNumber($("#hover-code"), { ...monthCodeOptions, motionBlur: false });
const audio = new TerminalAudio();
const albumPlayer = new AlbumPlayer();
albumPlayer.onRequestPlayback = () => { prefs.music = true; configureAudio(); savePrefs(); };
// The ambient loop yields to a CD song: it ducks out while a track with audio is
// playing and comes back when nothing is playing any more.
albumPlayer.onStatusChange = status => {
  audio.setAlbumActive(status === "playing" || status === "loading");
  syncBookletPlayback();
};
// Leaving the page stops the song where it is — resuming from the same second when
// the page comes back. Disposing here would leave the bfcache copy silent for good.
window.addEventListener("pagehide", () => albumPlayer.suspend());
window.addEventListener("pageshow", () => albumPlayer.resume());
function configureAudio() {
  audio.configure({ ...prefs, music: prefs.music && mode === "boot" });
  albumPlayer.configure(prefs.music && mode !== "boot", prefs.musicVolume);
  audio.setAlbumActive(albumPlayer.getStats().status === "playing" || albumPlayer.getStats().status === "loading");
}
configureAudio();
const reviewEntry = reviewParams.has("scene") || reviewParams.has("time") || reviewParams.get("review") === "1";
let started = false;
const loading = $("#loading");
// The entry screen uses the actual viewport, including portrait phones; the
// reference animation still uses its calibrated 1920 x 1080 stage.
$("#viewport").append(loading);
$("#stage").inert = true;
$(".mobile-entry").inert = true;
const entry = !reviewEntry && (prefs.sound || prefs.music) ? new StartupGate({
  root: loading,
  unlock: () => audio.unlock(),
  cancel: () => audio.cancelEntry(),
  start: silent => completeStartup(silent),
}) : undefined;
if (entry) {
  audio.holdForEntry();
  if (prefs.music) void audio.prepareMusic().catch(() => { /* Entry offers retry. */ });
}
let audioPreview = false, audioPreviewRequest = 0;
let scene: ArchiveScene | undefined;
let viewer: ModelViewer | undefined;
const accessLog: { id: string; time: string }[] = [];
const columnMemory = archiveColumns.map((_, lane) => columnFiles(lane)[0]);
function recordAccess() {
  accessLog.unshift({
    id: records[selected].id,
    time: new Date().toLocaleTimeString("en-GB"),
  });
}
function saveAudioPrefs() {
  try {
    localStorage.setItem("rhine-settings", JSON.stringify(prefs));
  } catch {}
  configureAudio();
}
function superPerformanceEnabled() { return prefs.superPerformance; }
function effectiveRenderQuality() { return superPerformanceEnabled() ? superPerformanceQuality : prefs.rendering; }
function savePrefs() {
  if (!reviewParams.has("profile")) saveAudioPrefs();
  if (!motionActive("rollingText")) rollingTitles.forEach(title => title.finish());
  if (!motionActive("rollingNumbers")) [fileCounter, columnCounter, hoverCode].forEach(counter => counter.finish());
  if (!motionActive("surfaceTransitions")) {
    detailTransition.finish();
    modalTransition?.finish();
    tabTransition.finish();
    bookmarkFeedback?.cancel();
  }
  scene?.setMotion(prefs.motion);
  scene?.setTheme(prefs.colorTheme === "dark", !motionActive("surfaceTransitions") || !started);
  document.querySelectorAll<HTMLElement>("[data-color-theme]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.colorTheme === prefs.colorTheme)));
  scene?.setSuperPerformance(superPerformanceEnabled());
  viewer?.setSuperPerformance(superPerformanceEnabled());
  scene?.setQuality(effectiveRenderQuality());
  viewer?.setQuality(effectiveRenderQuality());
  viewer?.setMotion(prefs.motion);
  syncQualityUI(prefs.rendering);
  updateQualitySummary();
  fileCounter.update({ animated: motionActive("rollingNumbers") && mode === "archive" });
  rollingTitles.forEach(title => title.update({ animated: motionActive("rollingText") && mode === "archive" }));
  columnCounter.update({ animated: motionActive("rollingNumbers") && mode === "archive" });
  hoverCode.update({ animated: motionActive("rollingNumbers") && mode === "archive" });
  $("#stage").classList.toggle("reduce-motion", motionIsReduced());
  $("#stage").classList.toggle("reduce-surfaces", !motionActive("surfaceTransitions"));
  updateFooterClock(new Date(), motionActive("rollingNumbers"));
}
let previousLayout = "";
function fit() {
  const stage = $("#stage");
  const viewport = $("#viewport");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const reference = reviewParams.has("time") || reviewParams.get("review") === "1";
  const { width, height, scale, kind } = mode === "boot" && !reference
    ? openingLayout(viewport.clientWidth, viewport.clientHeight)
    : viewportLayout(viewport.clientWidth, viewport.clientHeight, coarse, mode === "boot");
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  stage.dataset.layout = kind;
  stage.dataset.touch = String(coarse);
  viewport.dataset.mobileBoot = String(mode === "boot" && (coarse || viewport.clientWidth < 1100));
  stage.style.setProperty("--stage-scale", String(scale));
  stage.style.setProperty("--opening-width", `${width}px`);
  stage.style.setProperty("--opening-height", `${height}px`);
  stage.style.setProperty("--opening-scan-scale", String(Math.min(1, width / 1920)));
  stage.dataset.openingPortrait = String(width < height);
  // The software keyboard resizes dialogs without recomposing the 3D scene.
  const visible = window.visualViewport;
  const stageTop = (viewport.clientHeight - height * scale) / 2;
  stage.style.setProperty("--modal-top", `${Math.max(0, (visible?.offsetTop ?? 0) - stageTop) / scale}px`);
  stage.style.setProperty("--modal-height", `${Math.min(height, (visible?.height ?? viewport.clientHeight) / scale)}px`);
  $("#viewport").style.setProperty("--scale", String(scale));
  const marks = document.querySelector("#inspection-marks");
  marks?.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const layoutKey = JSON.stringify([width, height, scale, kind, devicePixelRatio]);
  if (layoutKey !== previousLayout) {
    previousLayout = layoutKey;
    scene?.resize();
    viewer?.resize();
  }
  updateQualitySummary();
  // Re-measure line covers and tab underline after wrapping changes.
  requestAnimationFrame(() => {
    documentDecryption.refresh();
    const tab = document.querySelector<HTMLElement>(".detail-tabs button.active");
    const indicator = document.querySelector<HTMLElement>(".tab-indicator");
    if (tab && indicator) indicator.style.transform = `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth})`;
  });
}
window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
window.visualViewport?.addEventListener("scroll", fit);
matchMedia("(pointer: coarse)").addEventListener("change", fit);
// Dragging the window to a display with another pixel density does not always
// fire a resize event, so watch the ratio itself and re-fit the render scale.
let densityQuery: MediaQueryList | undefined;
function onDensityChange() { watchDensity(); fit(); }
function watchDensity() {
  densityQuery?.removeEventListener("change", onDensityChange);
  densityQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  densityQuery.addEventListener("change", onDensityChange);
}
watchDensity();
fit();
$("#file-ticks").innerHTML = careerRoadmapMonths
  .map((_, index) => `<button data-select="${index}"></button>`)
  .join("");
const fileTicks = [...$("#file-ticks").querySelectorAll<HTMLButtonElement>("button")];

function setMode(next: Mode) {
  const previousMode = mode;
  rollingTitles.forEach(title => title.update({ animated: motionActive("rollingText") && next === "archive" }));
  if (next !== "archive") {
    rollingTitles.forEach(title => title.finish());
    hoverCode.finish();
    $("#hover-label").hidden = true;
  }
  if (next === "detail" && mode !== "detail") recordAccess();
  mode = next;
  audio.setScene(next);
  configureAudio();
  if (next !== "boot" && audioPreview) {
    audioPreview = false;
    audioPreviewRequest++;
    configureAudio();
  }
  $("#stage").dataset.mode = next;
  if (previousMode !== next) fit();
  $("#boot").inert = next !== "boot";
  $("#boot").setAttribute("aria-hidden", String(next !== "boot"));
  $("#archive-ui").inert = next !== "archive" || Boolean(modal);
  $("#archive-ui").setAttribute("aria-hidden", String(next !== "archive" || Boolean(modal)));
  $(".system-nav").inert = next === "boot" || Boolean(modal);
  $(".system-footer").inert = next === "boot" || Boolean(modal);
  if (next === "detail") {
    if (previousMode !== "detail") detailTransition.show(!motionActive("surfaceTransitions"));
  } else if (previousMode === "detail" || (next === "boot" && !$("#detail-ui").hidden)) {
    pendingDetailFocus = false;
    tabTransition.cancel();
    detailTransition.hide(!motionActive("surfaceTransitions") || next === "boot");
    if (!modal && next === "archive") $(".read-file").focus({ preventScroll: true });
  }
  $("#detail-ui").inert = next !== "detail" || Boolean(modal);
  scene?.setMode(next === "boot" ? "hidden" : next);
  if (next !== "boot") {
    bootSequence.reset();
    $(".file-title").firstChild!.textContent = "MONTH ";
    $("#stage").dataset.boot = "done";
  }
  if (next === "detail" && previousMode !== "detail") {
    renderDetail();
    pendingDetailFocus = true;
    if (!scene) {
      $("#detail-content").style.opacity = "1";
      $("#detail-content").style.translate = "0 0";
      $("#detail-content").inert = false;
    }
  }
}
function select(index: number, navigation?: ArchiveNavigation) {
  const wasDetail = mode === "detail";
  selected = (index + records.length) % records.length;
  albumPlayer.select(selected);
  columnMemory[fileLocation(selected).lane] = selected;
  activeTab = "overview";
  scene?.select(selected, navigation);
  updateSelection(navigation);
  // Switching inside the detail view keeps it: the case closes, the outgoing
  // copy files itself back into the shelf, the new one rises, and the document
  // beside it changes with the model instead of dropping the reader out to the
  // archive. Leaving is what the back control and Escape are for.
  if (wasDetail) renderDetail();
  const columnMove = navigation && "axis" in navigation && navigation.axis === "lane";
  audio.play(columnMove ? "column" : "tick", columnMove ? navigation.direction * .45 : 0);
}
function stepFile(direction: number) {
  const next = wrap((selected % careerRoadmapMonths.length) + direction, careerRoadmapMonths.length);
  select(next, fileLocation(next).lane === fileLocation(selected).lane ? { axis: "row", direction } : undefined);
}
function stepColumn(direction: number) {
  const next = wrap((selected % careerRoadmapMonths.length) + direction * 3, careerRoadmapMonths.length);
  select(next, { axis: "lane", direction });
}
function updateSelection(navigation?: ArchiveNavigation) {
  const monthIndex = selected % careerRoadmapMonths.length;
  const month = careerRoadmapMonths[monthIndex];
  $("#inspection-text strong").textContent = month.summary;
  const { lane } = fileLocation(selected);
  const phaseIndex = Math.floor(monthIndex / 3);
  selectionTitle.update({ text: month.phase.split(" / ")[0], animated: motionActive("rollingText") && mode === "archive" });
  clearanceTitle.update({ text: "PRIMARY TRACK", animated: motionActive("rollingText") && mode === "archive" });
  categoryTitle.update({ text: "12-MONTH ROADMAP", animated: motionActive("rollingText") && mode === "archive" });
  const direction =
    navigation && "axis" in navigation
      ? navigation.direction > 0
        ? "up"
        : "down"
      : "auto";
  selectedCode.update({
    text: String(monthIndex + 1).padStart(2, "0"),
    animated: motionActive("rollingText") && mode === "archive",
  });
  fileCounter.update({
    value: monthIndex + 1,
    animated: false,
    direction:
      navigation && "axis" in navigation && navigation.axis === "row"
        ? direction
        : "auto",
  });
  $(".count-total").textContent = String(careerRoadmapMonths.length).padStart(2, "0");
  columnCounter.update({
    value: phaseIndex + 1,
    animated: false,
    direction:
      navigation && "axis" in navigation && navigation.axis === "lane"
        ? direction
        : "auto",
  });
  // The roadmap uses stable month labels; finish the rolling counters after
  // each selection so old digit layers cannot remain visible during a switch.
  fileCounter.finish();
  columnCounter.finish();
  columnTitle.update({ text: "12-MONTH ROADMAP", animated: motionActive("rollingText") && mode === "archive" });
  $<HTMLButtonElement>('[data-action="column-prev"]').disabled = false;
  $<HTMLButtonElement>('[data-action="column-next"]').disabled = false;
  fileTicks.forEach((button, slot) => {
    const index = slot;
    const item = careerRoadmapMonths[index];
    button.dataset.select = String(index);
    button.setAttribute("aria-label", `选择路线图月份 ${item.label}，${item.action}`);
    button.title = `${item.label} · 12 个月路线图`;
    button.classList.toggle("selected", index === monthIndex);
    button.setAttribute("aria-pressed", String(index === monthIndex));
  });
}
function replayBoot(forcePreview = false) {
  if (!ready) return;
  closeModal(() => replayBootAfterModal(forcePreview));
}
function replayBootAfterModal(forcePreview: boolean) {
  bootStart = performance.now() / 1000 - 1.76;
  frozenTime = null;
  lastStep = "";
  setMode(!motionActive("boot") && !forcePreview ? "archive" : "boot");
  audio.restartBoot();
  scene?.select(0);
  selected = 0;
  updateSelection();
  if (!forcePreview) audio.play("ui-tick");
}
let detailPreparation: Promise<void> | null = null;
async function openFile() {
  if (!ready) return;
  const currentScene = scene;
  const currentSelection = selected;
  const currentMode = mode;
  // The startup warmup prepares exactly this geometry. Sharing its promise means a
  // press that arrives while the warmup is still running is honoured once it lands,
  // instead of being dropped on the floor (which is what the old flag did: pressing
  // Enter early looked like nothing happened).
  await (detailPreparation ??= Promise.resolve(currentScene?.prepareDetailGeometry())
    .then(() => {})
    .finally(() => { detailPreparation = null; }));
  if (scene !== currentScene || selected !== currentSelection || mode !== currentMode) return;
  closeModal(() => {
    setMode("detail");
    audio.play("open");
  });
}
function toggleSaved() {
  const id = records[selected].id;
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  try {
    localStorage.setItem("rhine-saved", JSON.stringify([...saved]));
  } catch {}
  const button = $<HTMLButtonElement>('[data-action="bookmark"]');
  const added = saved.has(id);
  button.firstChild!.textContent = added ? "− REMOVE FROM SAVED" : "＋ SAVE ARCHIVE";
  button.querySelector("span")!.textContent = added ? "已收藏" : "收藏档案";
  button.setAttribute("aria-pressed", String(added));
  bookmarkFeedback?.cancel();
  if (motionActive("surfaceTransitions")) bookmarkFeedback = button.animate(
    [{ backgroundColor: "#67634c" }, { backgroundColor: "#252820" }],
    { duration: 220, easing: "ease-out" },
  );
  audio.play("confirm");
  notify(saved.has(id) ? "档案已加入收藏" : "已取消收藏");
}
function renderDetail() {
  tabTransition.cancel();
  const r = records[selected];
  const month = careerRoadmapMonths[selected % careerRoadmapMonths.length];
  $("#object-id").textContent = `MONTH ${String((selected % careerRoadmapMonths.length) + 1).padStart(2, "0")}`;
  $("#detail-content").innerHTML = `
  <div class="detail-kicker"><span>12M ROADMAP</span><span>${escapeHtml(month.phase)}</span></div>
  <h2>${escapeHtml(month.label)}</h2><div class="detail-title-cn">${escapeHtml(month.action)}<span>PRIMARY TRACK</span></div>
  <div class="detail-actions"><button class="solid-button roadmap-primary" data-action="career"><strong>查看详细路线图</strong><span>12 MONTHS ↗</span></button></div>
  <div class="detail-rule"></div>
  <dl class="metadata"><div><dt>ACTION / 行动</dt><dd>${escapeHtml(month.action)}</dd></div><div><dt>OUTPUT / 交付</dt><dd>${escapeHtml(month.deliverable)}</dd></div><div><dt>ACCEPTANCE / 验收</dt><dd>${escapeHtml(month.acceptance)}</dd></div><div><dt>VALIDATOR / 证据</dt><dd><i></i>${escapeHtml(month.validator)}</dd></div></dl>
  <div class="detail-tabs" role="tablist"><button id="tab-overview" class="active" role="tab" aria-controls="tab-panel" aria-selected="true" data-tab="overview">01 <span>行动</span></button><button id="tab-notes" role="tab" aria-controls="tab-panel" aria-selected="false" data-tab="notes">02 <span>交付</span></button><button id="tab-history" role="tab" aria-controls="tab-panel" aria-selected="false" data-tab="history">03 <span>验收</span></button><i class="tab-indicator" aria-hidden="true"></i></div>
  <div id="tab-panel" class="tab-panel" role="tabpanel">${overview()}</div>
  <div class="detail-footnote"><span>${month.milestone ? escapeHtml(month.milestone) : "MONTHLY CONTROL BOARD"}</span><span>${String(selected + 1).padStart(2, "0")} / 12</span></div>`;
  $("#detail-content").setAttribute("tabindex", "-1");
  // The full document reveal gets the historical, slower model entrance;
  // subsequent entries and month switches retain the quicker interaction.
  const presentation = documentDecryption.enter($("#detail-content"), motionActive("documentReveal"), Boolean(scene));
  scene?.setDetailPresentation(presentation === "full");
  setTab(activeTab, false);
}
function overview() {
  const month = careerRoadmapMonths[selected];
  return `<div class="panel-label">ACTION / 本月行动</div><p>${escapeHtml(month.action)}</p>`;
}
function setTab(tab: string, sound = true) {
  if (sound && tab === activeTab) return;
  activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    const active = (b as HTMLElement).dataset.tab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
    b.setAttribute("tabindex", active ? "0" : "-1");
  });
  const month = careerRoadmapMonths[selected % careerRoadmapMonths.length];
  const tabButton = $<HTMLButtonElement>(`[data-tab="${tab}"]`);
  const indicator = $(".tab-indicator");
  indicator.style.transition = sound && motionActive("surfaceTransitions") ? "" : "none";
  indicator.style.transform = `translateX(${tabButton.offsetLeft}px) scaleX(${tabButton.offsetWidth})`;
  $("#tab-panel").setAttribute("aria-labelledby", tabButton.id);
  $("#tab-panel").innerHTML =
    tab === "overview"
      ? overview()
      : tab === "notes"
        ? `<div class="panel-label">OUTPUT / 交付物</div><p>${escapeHtml(month.deliverable)}</p>`
        : `<div class="panel-label">ACCEPTANCE / 验收证据</div><p>${escapeHtml(month.acceptance)}</p><p class="log-note">VALIDATOR / ${escapeHtml(month.validator)}</p>`;
  $("#tab-panel").scrollTop = 0;
  documentDecryption.refresh();
  if (sound) {
    tabTransition.reveal($("#tab-panel"), !motionActive("surfaceTransitions"));
    audio.play("ui-tick");
  }
}
function notify(message: string) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 2600);
}

function openModal(kind: NonNullable<typeof modal>) {
  if (!ready) return;
  if (!modal) {
    previousFocus = document.activeElement as HTMLElement;
    modalSiblings = [...$("#stage").children]
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node.id !== "modal-root")
      .map((node) => ({ node, inert: node.inert }));
    modalSiblings.forEach(({ node }) => (node.inert = true));
  }
  modalClosing = false;
  modal = kind;
  searchQuery = "";
  filter = "全部档案";
  audio.play("page-open");
  renderModal();
}
function closeModal(afterClose?: () => void) {
  if (!modal) {
    afterClose?.();
    return;
  }
  if (modalClosing) return;
  modalClosing = true;
  audio.play("page-close");
  modalTransition!.hide(!motionActive("surfaceTransitions"), () => {
    modal = null;
    modalClosing = false;
    $("#modal-root").replaceChildren();
    modalTransition = undefined;
    modalSiblings.forEach(({ node, inert }) => (node.inert = inert));
    modalSiblings = [];
    $("#archive-ui").inert = mode !== "archive";
    $("#detail-ui").inert = mode !== "detail";
    previousFocus?.focus({ preventScroll: true });
    afterClose?.();
  });
}
function syncBookletPlayback() {
  if (modal !== "booklet") return;
  const stats = albumPlayer.getStats();
  document.querySelectorAll<HTMLButtonElement>(".booklet-track").forEach(button => {
    const current = Number(button.dataset.trackIndex) === stats.track - 1;
    const active = current && (stats.status === "playing" || stats.status === "loading");
    button.setAttribute("aria-pressed", String(active));
    const label = button.querySelector<HTMLElement>(".booklet-track-state")!;
    const text = button.disabled ? "暂无音频" : active ? stats.status === "loading" ? "加载中…" : "▶ 播放中" : "▶ 播放";
    if (label.textContent !== text) label.textContent = text;
  });
}
function bookletMarkup() {
  const album = albumForMonth(selected);
  if (!album) return `<div class="booklet-heading"><span>CD INSERT / 盒内歌词本</span><h2>专辑待提供</h2></div>${albumTrackMarkup()}`;
  return `<div class="booklet-audio">音频${albumPlayer.getStats().status === "playing" ? "播放中" : albumPlayer.getStats().availableTracks ? "可播放" : "暂未提供"}</div><div class="booklet-heading"><span>CD INSERT / 盒内歌词本</span><h2>${escapeHtml(album?.title ?? "专辑待提供")}</h2><p>${escapeHtml(album?.artist ?? "等待你提供本月专辑")}</p></div><div class="booklet-pages"><section aria-label="专辑介绍">${albumDescriptionMarkup(album)}</section><section aria-label="专辑曲目">${albumTrackMarkup(album, index => albumPlayer.hasTrack(index))}</section></div>${album ? `<a class="album-official-link" href="${escapeHtml(album.listenUrl)}" target="_blank" rel="noopener">官方专辑入口 ↗</a>` : ""}`;
}
function renderModal() {
  if (!modal) return;
  modalTransition?.dispose();
  const isCareer = modal === "career";
  const isBooklet = modal === "booklet";
  const modalLabel = isBooklet ? "CD 盒内歌词本" : isCareer ? "12 个月职业路线图" : modal === "settings" ? "系统设置" : modal === "saved" ? "收藏档案" : "档案检索";
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="terminal-modal ${modal === "settings" ? "settings-modal" : ""} ${isCareer ? "career-modal" : ""} ${isBooklet ? "booklet-modal" : ""}" role="dialog" aria-modal="true" aria-label="${modalLabel}"><div class="modal-top"><span>CAREER OS / ${isCareer ? "PERSONNEL DEVELOPMENT" : modal === "settings" ? "SYSTEM PREFERENCES" : "ARCHIVE DIRECTORY"}</span><button data-action="close-modal" aria-label="关闭窗口">CLOSE <span>×</span></button></div>${isBooklet ? bookletMarkup() : isCareer ? careerRoadmapMarkup() : modal === "settings" ? settingsMarkup() : `<h2>${modal === "saved" ? "SAVED ARCHIVES" : "ARCHIVE INDEX"}<small>${modal === "saved" ? "收藏档案" : "内部档案检索"}</small></h2><div class="search-field"><span>⌕</span><input id="archive-search" type="search" autocomplete="off" placeholder="输入档案编号、名称或科室" aria-label="检索档案"/><span class="key">ESC</span></div><div class="category-filters">${categories.map((c, i) => `<button data-filter="${escapeHtml(c)}" class="${i === 0 ? "active" : ""}">${escapeHtml(c)}</button>`).join("")}</div><div class="result-header"><span>FILE / 档案</span><span>DEPARTMENT / 科室</span><span>ACCESS</span></div><div id="search-results" class="search-results"></div><div class="modal-bottom"><span id="result-count"></span><span>EVIDENCE DATABASE <i>●</i> CONNECTED</span></div>`}</section></div>`;
  const backdrop = $(".modal-backdrop");
  backdrop.hidden = true;
  modalTransition = new SurfaceTransition(backdrop, $(".terminal-modal"));
  modalTransition.show(!motionActive("surfaceTransitions"));
  if (modal === "settings") updateQualitySummary();
  if (modal === "career" || modal === "booklet") {
    requestAnimationFrame(() => $('[data-action="close-modal"]')?.focus({ preventScroll: true }));
  } else if (modal !== "settings") {
    renderResults();
    requestAnimationFrame(() => {
      if (backdrop.isConnected && !modalClosing) $("#archive-search").focus();
    });
  } else
    requestAnimationFrame(() => {
      if (backdrop.isConnected && !modalClosing) $('[data-action="close-modal"]').focus();
    });
  $("#modal-root")
    .querySelector(".modal-backdrop")
    ?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
}
function renderResults() {
  const results = records
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        (modal !== "saved" || saved.has(r.id)) &&
        (filter === "全部档案" || r.category === filter) &&
        `${r.id} ${r.title} ${r.en} ${r.department} ${r.lead}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  $("#search-results").innerHTML = results.length
    ? results
        .map(
          ({ r, i }) =>
            `<button class="result-row" data-result="${i}"><span class="result-name"><b>${r.id}</b><span>${escapeHtml(r.title)}<small>${escapeHtml(r.en)}</small></span>${saved.has(r.id) ? "<i>＋</i>" : ""}</span><span>${escapeHtml(r.department)}</span><span>${r.clearance === "RESTRICTED" ? "CATALOG ONLY" : "AUTHORIZED"} <i>↗</i></span></button>`,
        )
        .join("")
    : `<div class="empty-results"><span>∅</span><strong>${modal === "saved" && !searchQuery ? "尚无收藏档案" : "没有匹配的档案"}</strong><p>${modal === "saved" && !searchQuery ? "读取档案时，选择 SAVE ARCHIVE 将其保存在此处。" : "尝试其他名称、档案编号，或切换科室分类。"}</p><button data-action="reset-search">${modal === "saved" ? "查看全部档案 →" : "重置检索 →"}</button></div>`;
  $("#result-count").textContent =
    `${String(results.length).padStart(2, "0")} RECORDS FOUND`;
}
function updateQualitySummary() {
  const summary = document.querySelector("#quality-summary");
  if (!summary) return;
  if (!scene) { summary.textContent = "3D 已关闭 · 三维模型与渲染资源已释放"; return; }
  const canvas = scene.renderer.domElement;
  const metrics = JSON.parse(canvas.parentElement?.dataset.renderQuality ?? "{}");
  const limit = metrics.limit === "texture" ? "GPU 纹理上限"
    : metrics.limit === "budget" ? (metrics.postprocessing ? "抗锯齿缓冲区上限" : "渲染缓冲区上限") : "";
  summary.textContent = `${superPerformanceEnabled() ? "超级性能模式已启用 · 画质设置暂被覆盖，关闭后恢复 · " : ""}当前渲染 ${canvas.width} × ${canvas.height} · 抗锯齿 ${effectiveRenderQuality().antialias === "smaa" ? "SMAA" : "原始"}${limit ? ` · 受${limit}限制` : ""} · 纹理过滤 ${metrics.anisotropy ?? 1}×`;
}
function motionPreferenceNoteMarkup() {
  const preset = prefs.motionPreset;
  const allEnabled = Object.values(prefs.motion).every(Boolean);
  return `<div id="motion-preference-note" class="motion-preference-note"><p>${motionSummary(prefs.motion)}</p><span>预设：${preset === "full" ? "完整动画" : preset === "reduced" ? "减少动画" : "自定义"} · 选择会保存在本站</span>${allEnabled ? "" : '<button data-action="enable-motion">启用完整动画并重播 ↻</button>'}</div>`;
}
// Controller support: mapping, hot swap and haptics live in packages/gamepad-input.
// This is the terminal's side — which scroll box the right stick drives, the toast
// when a pad appears, and the live status line inside the settings panel.
let gamepadBridge: GamepadBridge;
const gamepadStatusMarkup = () => gamepadSettingsMarkup(prefs, gamepadBridge.status());
gamepadBridge = createGamepadBridge({
  isEnabled: () => prefs.gamepad,
  isRumbleEnabled: () => prefs.gamepadRumble,
  notify,
  isStarted: () => started,
  scrollTarget: resolveScrollTarget,
  // Shoulders step the album and X plays or pauses it, but the transport only
  // exists once a case is open. The play button renames itself while it plays.
  onTransport: (control) => {
    if (mode !== "detail" || modal || viewer?.isOpen) return;
    const selector = control === "toggle"
      ? '[aria-label="播放"], [aria-label="暂停"]'
      : `[aria-label="${control === "next" ? "下一首" : "上一首"}"]`;
    const button = document.querySelector<HTMLButtonElement>(`.disc-controls ${selector}`);
    if (button?.getClientRects().length) button.click();
  },
  onStatusChanged: () => {
    const panel = $("#gamepad-settings");
    if (panel && modal === "settings") panel.outerHTML = gamepadStatusMarkup();
  },
});
function settingsMarkup() {
  return `<h2>SYSTEM SETTINGS<small>终端偏好设置</small></h2><p class="settings-intro">CAREER PLANNER <span>·</span> WORKSHEET</p><div class="settings-list">${themeSettingsMarkup(prefs.colorTheme === "dark")}<label><div><strong>SUPER PERFORMANCE</strong><span>降低三维画质和渲染分辨率，保留完整动效；关闭后恢复原画质</span></div><input type="checkbox" data-pref="superPerformance" ${prefs.superPerformance ? "checked" : ""}/><i class="toggle"></i></label>${audioSettingsMarkup(prefs)}</div>${motionPreferenceNoteMarkup()}${motionSettingsMarkup(prefs.motion, prefs.motionPreset)}${qualityMarkup(prefs.rendering)}${gamepadStatusMarkup()}<div class="settings-shortcuts"><span>KEYBOARD CONTROLS</span><p><kbd>←</kbd><kbd>→</kbd> 切列 <kbd>↑</kbd><kbd>↓</kbd> 选档 <kbd>ENTER</kbd> 读取 <kbd>/</kbd> 检索 <kbd>ESC</kbd> 返回</p><p><span>GAMEPAD</span> 左摇杆 / 十字键 移动 · A / × 确认 · B / ○ 返回 · Y / △ 选中框 · LB / RB 切歌 · X / □ 播放暂停 · 菜单键 设置 · 右摇杆 滚动</p></div><div class="settings-bottom">${document.fullscreenEnabled ? '<button data-action="fullscreen">FULLSCREEN <span>↗</span></button>' : ''}<button data-action="restart">REINITIALIZE SYSTEM <span>↻</span></button></div><div class="modal-bottom"><span>CAREER PLANNER · 使用 MiSans 字体（小米） <a href="${assetUrl("fonts/MiSans-license.pdf")}" target="_blank" rel="noopener">字体许可</a></span><span>BASED ON RHINELABUI · BLANK CAREER PLANNING TEMPLATE</span></div>`;
}

document.addEventListener("input", (e) => {
  const slider = e.target as HTMLInputElement;
  if (slider.dataset.quality) {
    const output = document.querySelector<HTMLOutputElement>(`[data-quality-output="${slider.dataset.quality}"]`);
    if (output) output.value = `${slider.value}%`;
  }
  const volume = e.target as HTMLInputElement;
  if (volume.dataset.volume === "musicVolume" || volume.dataset.volume === "soundVolume") {
    prefs[volume.dataset.volume] = Number(volume.value) / 100;
    volume.closest("label")?.querySelector("output")?.replaceChildren(`${volume.value}%`);
    saveAudioPrefs();
  }
  if ((e.target as HTMLElement).id === "archive-search") {
    searchQuery = (e.target as HTMLInputElement).value;
    renderResults();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "quality-preset" && Object.hasOwn(qualityPresets, el.value)) {
    prefs.rendering = { ...qualityPresets[el.value as QualityPreset], resolution: prefs.rendering.resolution, scale: prefs.rendering.scale, pixelRatio: prefs.rendering.pixelRatio };
    savePrefs();
  } else if (el.dataset.quality) {
    const key = el.dataset.quality as keyof RenderQuality;
    prefs.rendering = normalizeQuality({ ...prefs.rendering, [key]: key === "antialias" || key === "resolution" ? el.value : Number(el.value) });
    savePrefs();
  }
  if (el.dataset.pref) {
    const key = el.dataset.pref;
    if (key === "sound" || key === "music" || key === "quality" || key === "superPerformance" || key === "gamepad" || key === "gamepadRumble") prefs[key] = el.checked;
    if (key === "sound" || key === "music") saveAudioPrefs(); else savePrefs();
    if (key === "gamepad" || key === "gamepadRumble") gamepadBridge.setEnabled(prefs.gamepad);
    audio.play("confirm");
  }
  if (el.dataset.motion) {
    const key = el.dataset.motion as MotionKey;
    prefs.motion[key] = el.checked;
    prefs.motionPreset = motionPresetFor(prefs.motion);
    savePrefs();
    const motionRoot = $("#motion-settings");
    const advancedOpen = motionRoot.querySelector<HTMLDetailsElement>(".motion-advanced")?.open ?? false;
    const settingsPanel = motionRoot.closest<HTMLElement>(".settings-modal");
    const scrollTop = settingsPanel?.scrollTop ?? 0;
    motionRoot.outerHTML = motionSettingsMarkup(prefs.motion, prefs.motionPreset);
    $("#motion-preference-note").outerHTML = motionPreferenceNoteMarkup();
    $("#motion-settings").querySelector<HTMLDetailsElement>(".motion-advanced")!.open = advancedOpen;
    requestAnimationFrame(() => {
      if (settingsPanel) settingsPanel.scrollTop = scrollTop;
      document.querySelector<HTMLInputElement>(`[data-motion="${key}"]`)?.focus({ preventScroll: true });
    });
    notify(key === "boot" ? "开场设置将在下次重播时生效" : el.checked ? "已启用此动画" : "已关闭此动画");
    audio.play("confirm");
  }
});
document.addEventListener("click", (e) => {
  const themeButton = (e.target as Element).closest<HTMLElement>("[data-color-theme]");
  if (themeButton) { prefs.colorTheme = themeButton.dataset.colorTheme === "dark" ? "dark" : "light"; savePrefs(); return; }
  if (!started) return;
  if (modalClosing) return;
  const el = (e.target as Element).closest<HTMLElement>("button");
  if (!el) return;
  if (el.dataset.action === "motion-preset") {
    const preset = el.dataset.preset;
    if (preset !== "full" && preset !== "reduced") return;
    prefs.motionPreset = preset;
    prefs.motion = preset === "full" ? fullMotion() : reducedMotion();
    savePrefs();
    renderModal();
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-action="motion-preset"][data-preset="${prefs.motionPreset}"]`)?.focus({ preventScroll: true }));
    audio.play("confirm");
    return;
  }
  if (el.dataset.select) {
    select(Number(el.dataset.select));
    return;
  }
  if (el.dataset.result) {
    const index = Number(el.dataset.result);
    closeModal(() => {
      select(index);
      openFile();
    });
    return;
  }
  if (el.dataset.filter) {
    filter = el.dataset.filter;
    document
      .querySelectorAll("[data-filter]")
      .forEach((b) =>
        b.classList.toggle(
          "active",
          (b as HTMLElement).dataset.filter === filter,
        ),
      );
    renderResults();
    return;
  }
  if (el.dataset.tab) {
    setTab(el.dataset.tab);
    return;
  }
  if (el.dataset.careerMonth) {
    const month = careerRoadmapMonths.find((item) => item.id === el.dataset.careerMonth);
    if (!month) return;
    document.querySelectorAll<HTMLElement>("[data-career-month]").forEach((button) => {
      button.classList.toggle("active", button.dataset.careerMonth === month.id);
      button.setAttribute("aria-selected", String(button.dataset.careerMonth === month.id));
    });
    const detail = document.querySelector<HTMLElement>("#career-month-detail");
    if (detail) detail.innerHTML = careerMonthMarkup(month);
    audio.play("ui-tick");
    return;
  }
  const action = el.dataset.action;
  if (action === "sound-preview") audio.play("confirm");
  if (action === "skip") {
    setMode("archive");
    audio.play("confirm");
  }
  if (action === "prev") stepFile(-1);
  if (action === "next") stepFile(1);
  if (action === "column-prev") stepColumn(-1);
  if (action === "column-next") stepColumn(1);
  if (action === "open") openFile();
  if (action === "model-viewer" && mode === "detail" && scene) {
    const activeScene = scene;
    // Safari does not always focus a button when it is tapped. Capture the
    // actual opener so closing the modal reliably restores the right control.
    el.focus({ preventScroll: true });
    viewer ??= new ModelViewer($("#stage"), () => { audio.setScene(mode); audio.play("page-close"); }, (sound) => audio.play(sound === "tick" ? "ui-tick" : sound));
    audio.setScene("viewer");
    viewer.setSuperPerformance(superPerformanceEnabled());
    viewer.setQuality(effectiveRenderQuality());
    viewer.setMotion(prefs.motion);
    scene.finishDecryption();
    const month = careerRoadmapMonths[selected % careerRoadmapMonths.length];
    viewer.albumPlayer = albumPlayer;
    viewer.open(
      month.id,
      `${albumForMonth(selected)?.title ?? "待提供"} · ${month.label}`,
      () => activeScene.createAssemblyModel(),
      !motionActive("viewerNavigation"),
    );
    audio.play("page-open");
  }
  if (action === "booklet-track") {
    albumPlayer.playTrack(Number(el.dataset.trackIndex));
    syncBookletPlayback();
    return;
  }
  if (action === "booklet") openModal("booklet");
  if (action === "back") {
    setMode("archive");
    audio.play("back");
  }
  if (action === "search" || action === "saved" || action === "settings" || action === "career") {
    el.focus({ preventScroll: true });
    openModal(action);
  }
  if (action === "close-modal") closeModal();
  if (action === "bookmark") toggleSaved();
  if (action === "reset-search") {
    modal = "search";
    searchQuery = "";
    filter = "全部档案";
    renderModal();
  }
  if (action === "replay" || action === "restart") {
    replayBoot();
  }
  if (action === "enable-motion") {
    prefs.motion = fullMotion();
    prefs.motionPreset = "full";
    savePrefs();
    replayBoot();
  }
  if (action === "fullscreen" && document.fullscreenEnabled) {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement
        .requestFullscreen()
        .catch(() => notify("请使用浏览器的全屏快捷键 F11"));
  }
});
document.addEventListener("keydown", (e) => {
  if (!started) return;
  if (viewer?.isOpen) return;
  if (modalClosing) {
    e.preventDefault();
    return;
  }
  const typing = e.target instanceof HTMLInputElement;
  if (e.key === "Escape") {
    if (modal) closeModal();
    else if (mode === "detail" || (mode === "boot" && ready)) { const sound = mode === "detail" ? "back" : "ui-tick"; setMode("archive"); audio.play(sound); }
    return;
  }
  if (modal && e.key === "Tab") {
    const focusables = [
      ...$("#modal-root").querySelectorAll<HTMLElement>(
        'button,input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
      ),
    ];
    const visible = focusables.filter(el => el.getClientRects().length > 0);
    const first = visible[0],
      last = visible.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  if (typing || modal || !ready) return;
  if (
    (e.target as HTMLElement).dataset.tab &&
    ["ArrowLeft", "ArrowRight"].includes(e.key)
  ) {
    e.preventDefault();
    const tabs = ["overview", "notes", "history"];
    setTab(
      tabs[(tabs.indexOf(activeTab) + (e.key === "ArrowRight" ? 1 : 2)) % 3],
    );
    $<HTMLButtonElement>(`[data-tab="${activeTab}"]`).focus();
    return;
  }
  if (e.key === "/") {
    e.preventDefault();
    if (mode === "boot") setMode("archive");
    openModal("search");
  }
  if (e.key === "ArrowLeft" && mode !== "boot") {
    e.preventDefault();
    stepColumn(-1);
  }
  if (e.key === "ArrowRight" && mode !== "boot") {
    e.preventDefault();
    stepColumn(1);
  }
  if (["ArrowUp", "ArrowDown"].includes(e.key) && mode !== "boot") {
    e.preventDefault();
    stepFile(e.key === "ArrowUp" ? -1 : 1);
  }
  // Enter reads the selected file and nothing else. Without taking the event the
  // browser also activates whatever control holds focus — closing a panel restores
  // focus to the button that opened it, so Enter used to re-open the settings
  // instead of reading a file. Buttons keep Space for keyboard activation.
  if (e.key === "Enter") {
    e.preventDefault();
    if (mode === "boot") setMode("archive");
    else if (mode === "archive") openFile();
  }
});

const ease = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
function bootFrame(t: number) {
  audio.updateBoot(t, frozenTime !== null);
  const motion = bootSequence.update(t);
  let step: string = motion.step;
  if (t >= 22) {
    step = "array";
  }
  if (t >= 25.68) {
    step = "select";
  }
  if (t >= 28.3) {
    step = "inspect";
  }
  if (step !== lastStep) {
    $("#stage").dataset.boot = step;
    lastStep = step;
  }
  $(".file-title").firstChild!.textContent =
    step === "array"
      ? "SELECTING FILES...".slice(0, Math.max(0, Math.floor((t - 21.94) * 18)))
      : "MONTH ";
  $("#stage").style.setProperty(
    "--entry-opacity",
    String(ease((t - 21.9) / 0.13)),
  );
  $(".callout-rule").style.transform = `scaleX(${ease((t - 22.08) / 0.9)})`;
  const reveal = ease((t - 22) / 0.4),
    lift = ease((t - 26) / 1.8),
    // Both phases of the push-in are pinned to the hand-off, so the film is
    // still closing in when the detail view takes over.
    zoom = 0.55 * ease((t - 27.3) / 1.65) + 0.45 * ease((t - 29.0) / (CINEMATIC_HANDOFF - 29.0));
  if (t >= CINEMATIC_HANDOFF) {
    setMode("detail");
    return undefined;
  }
  return { reveal, lift, zoom, time: t };
}

const inspectionOverlay = new InspectionOverlay();
const documentDecryption = new DocumentDecryption();
// A newly opened archive can introduce another font shard. Re-measure its
// redaction lines after font swap while retaining the current reveal progress.
document.fonts.addEventListener("loadingdone", () => documentDecryption.refresh());

let lastTime = 0,
  frameCount = 0,
  frameStart = performance.now(),
  fps = 0;
const runtime = new RuntimeReport();
const frameProfile = reviewParams.has("profile") ? new FrameProfile((phase, index) => {
  if (phase === "archive" || phase === "return") setMode("archive");
  else if (phase === "navigation") select(index % records.length);
  else if (phase === "detail") openFile();
}) : null;
let paintedDetailVisibility = -1;
let paintedDetailRoot: HTMLElement | null = null;
let paintedDetailShade = -1;
/** One animation frame. Failures are reported and bounded instead of silent. */
function frame(ms: number) {
  runtime.tick();
  try {
    if (scene) frameProfile?.begin(ms, scene.renderer.getContext() as WebGL2RenderingContext);
    renderFrame(ms);
    frameProfile?.end();
  } catch (error) {
    if (!runtime.fail(error)) return;
  }
  requestAnimationFrame(frame);
}
function renderFrame(ms: number) {
  if (document.hidden) return;
  const time = ms / 1000;
  const theme = scene?.themeAmount ?? (prefs.colorTheme === "dark" ? 1 : 0);
  paintTheme(theme);
  viewer?.setTheme(theme);
  const cinema =
    mode === "boot" && ready
      ? bootFrame(frozenTime ?? time - bootStart)
      : undefined;
  // The calibrated 2D opening fully covers the scene until array entry.
  // Finish the first inspected mesh behind the opening, rather than replacing
  // its silhouette and shadow after the detail shot is already on screen.
  if (cinema && cinema.time < 21.9) void scene?.prepareDetailGeometry();
  if (!viewer?.isOpen && (!cinema || cinema.time >= 21.9)) scene?.update(time, cinema);
  viewer?.update(time);
  if (scene?.discControls && viewer?.isOpen) scene.discControls.root.hidden = true;
  if (scene && mode === "detail") {
    documentDecryption.update(time, scene.decryptionFrame, !motionActive("documentReveal"), scene.detailVisibility);
    scene.setDocumentRevealStarted(documentDecryption.revealStarted);
    const detailRoot = $("#detail-content");
    const visibility = Math.round(scene.detailVisibility * 10000) / 10000;
    if (visibility !== paintedDetailVisibility || detailRoot !== paintedDetailRoot) {
      detailRoot.style.opacity = String(visibility);
      detailRoot.style.translate = `0 ${(1 - visibility) * 18}px`;
      detailRoot.inert = visibility < 0.1;
      paintedDetailVisibility = visibility;
      paintedDetailRoot = detailRoot;
    }
    if (pendingDetailFocus && scene.detailVisibility >= 0.1 && !modal && !viewer?.isOpen) {
      $("#detail-content").focus({ preventScroll: true });
      pendingDetailFocus = false;
    }
  }
  const detailShade = Math.round((mode === "boot" ? 0 : scene?.detailVisibility ?? 0) * 10000) / 10000;
  if (detailShade !== paintedDetailShade) {
    $("#stage").style.setProperty("--detail-shade", String(detailShade));
    paintedDetailShade = detailShade;
  }
  const currentScene = scene;
  if (currentScene) inspectionOverlay.render(currentScene.decryptionFrame,
    (x, y) => currentScene.projectCard(x, y), Boolean(cinema), motionActive("modelDecryption"));
  if (Math.floor(time) !== lastTime) {
    lastTime = Math.floor(time);
    syncBookletPlayback();
    updateFooterClock(new Date(), motionActive("rollingNumbers"));
  }
  frameCount++;
  if (ms - frameStart > 1000) {
    fps = (frameCount * 1000) / (ms - frameStart);
    frameStart = ms;
    frameCount = 0;
    $("#three-scene").dataset.fps = String(Math.round(fps));
    $("#three-scene").dataset.renderStats = JSON.stringify(scene?.getStats() ?? { loaded: false, drawCalls: 0, triangles: 0 });
  }
}
function bindScene(scene: ArchiveScene, cell?: { lane: number; row: number }) {
    scene.discControls ??= new DiscControls($("#three-scene"), albumPlayer);
    scene.onBooklet = () => { if (mode === "detail" && !modal) openModal("booklet"); };
    scene.select(selected, cell ? { cell } : undefined);
    scene.onSelect = (i, cell) => {
      if (mode !== "archive" || modal || viewer?.isOpen) return;
      select(i, cell ? { cell } : undefined);
    };
    scene.onOpen = () => {
      if (mode !== "archive" || modal || viewer?.isOpen) return;
      openFile();
    };
    scene.onNavigate = (axis, direction) => {
      if (mode !== "archive" || modal || viewer?.isOpen) return;
      if (axis === "lane") stepColumn(direction);
      else stepFile(direction);
    };
    // Every hovered cell used to restart a full roll of the title. The rolling host
    // rebuilds one column per glyph and starts one Web Animation per glyph, property
    // and gap, so a sweep of a long month title started ~900 animations per second
    // and stacked 460ms rolls until single frames cost over 100ms. Instant updates
    // take the library's cheap path instead, so the label can follow the pointer on
    // every change and move as one composited element, while a roll still plays when
    // the pointer rests on a case and no roll is already running.
    let hoverLabelAnimation: Animation | undefined;
    let hoverLabelTimer: ReturnType<typeof setTimeout> | undefined;
    let hoverLabelPending: number | null = null;
    let hoverRollUntil = 0;
    // Coalesce a fast sweep into at most one paint per frame budget, and keep rolls
    // further apart than one roll lasts so two never overlap.
    const HOVER_PAINT_MS = 80;
    const HOVER_ROLL_GAP_MS = 900;
    const HOVER_SLIDE_MS = 240;
    const paintHoverLabel = (i: number) => {
      hoverLabelPending = null;
      const label = $("#hover-label");
      const rolling = motionActive("rollingText") && mode === "archive";
      const numbersRolling = motionActive("rollingNumbers") && mode === "archive";
      const first = label.hidden;
      const now = performance.now();
      const roll = !first && (rolling || numbersRolling) && now >= hoverRollUntil;
      if (roll) hoverRollUntil = now + HOVER_ROLL_GAP_MS;
      hoverCode.update({ value: (i % records.length) + 1, animated: roll && numbersRolling });
      hoverTitle.update({ text: records[i].title, animated: roll && rolling });
      label.hidden = false;
      if (first) {
        // Prepare the first visible value so the next hover can animate immediately.
        hoverCode.update({ animated: numbersRolling });
        hoverTitle.update({ animated: rolling });
        return;
      }
      if (roll || !rolling) return;
      // One composited transition stands in for the per-glyph roll, so the label
      // keeps moving with the pointer instead of snapping between cells.
      hoverLabelAnimation?.cancel();
      hoverLabelAnimation = hoverTitleElement.animate(
        [{ opacity: .35, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
        { duration: HOVER_SLIDE_MS, easing: "cubic-bezier(.2,.7,.2,1)" },
      );
    };
    scene.onHover = (i) => {
      if (i === null) {
        if (hoverLabelTimer !== undefined) clearTimeout(hoverLabelTimer);
        hoverLabelTimer = undefined;
        hoverLabelPending = null;
        hoverLabelAnimation?.cancel();
        hoverLabelAnimation = undefined;
        $("#hover-label").hidden = true;
        hoverCode.finish();
        hoverTitle.finish();
        return;
      }
      if ($("#hover-label").hidden) {
        paintHoverLabel(i);
        return;
      }
      // A paint is already queued: only remember the newest cell so the timer can
      // never be pushed back by a moving pointer.
      hoverLabelPending = i;
      if (hoverLabelTimer !== undefined) return;
      hoverLabelTimer = setTimeout(() => {
        hoverLabelTimer = undefined;
        if (hoverLabelPending !== null) paintHoverLabel(hoverLabelPending);
      }, HOVER_PAINT_MS);
    };
}
async function start() {
  try {
    scene = new ArchiveScene($("#three-scene"));
    scene.setTheme(prefs.colorTheme === "dark", true);
    await Promise.all([
      scene?.load(),
      loadBootWebfonts(),
      // With unicode-range faces, preload the opening's actual characters,
      // not every font shard. Other archive text loads on demand.
      document.fonts.load("300 20px MiSans", "ACCESS WELCOME TO EVIDENCE DATABASE"),
      document.fonts.load("400 20px MiSans", "个人资料待填写请求已接收开始处理权限验证通过职业规划工作表来源日期范围限制待核实0123456789 CAREER PLANNER"),
      document.fonts.load("600 20px MiSans", "EVIDENCE DRIVEN CAREER OS"),
      document.fonts.load("700 20px MiSans", "CAREER ROADMAP WELCOME TO EVIDENCE DATABASE PLANNING WORKSPACE"),
    ]);
    if (scene) bindScene(scene);
    savePrefs();
    await scene?.warmup();
    ready = true;
    select(0);
    if (entry) entry.ready();
    else completeStartup(false);
  } catch (error) {
    console.error(error);
    $("#loading").innerHTML =
      '<div class="error-state"><strong>CONNECTION INTERRUPTED</strong><p>三维档案资源未能载入。请确认浏览器已启用硬件加速，然后重新连接。</p><button onclick="location.reload()">RECONNECT →</button></div>';
  }
}
function completeStartup(silent: boolean) {
  if (started || !ready) return;
  started = true;
  if (silent) {
    prefs.sound = false;
    prefs.music = false;
    saveAudioPrefs();
  }
  audio.releaseEntry();
  audio.restartBoot();
  const fade = motionActive("boot") ? 600 : 0;
  bootStart = performance.now() / 1000 - (reviewParams.has("time") ? Number(reviewParams.get("time")) : 1.76);
  if (!reviewParams.has("time")) bootStart += fade / 1000;
  setMode("boot");
  if (reviewParams.get("scene") === "archive" || (!motionActive("boot") && !reviewParams.has("time"))) setMode("archive");
  if (reviewParams.get("scene") === "detail") setMode("detail");
  $("#stage").inert = false;
  $(".mobile-entry").inert = false;
  loading.classList.add("loaded");
  loading.inert = true;
  setTimeout(() => {
    const restoreFocus = loading.contains(document.activeElement) || document.activeElement === document.body;
    loading.remove();
    if (entry && restoreFocus) {
      const skip = $("#skip");
      const target = mode === "boot" ? skip.getClientRects().length ? skip : $(".mobile-entry") : $(".read-file");
      target.focus({ preventScroll: true });
    }
  }, fade);
  requestAnimationFrame(frame);
}
updateSelection();
void start();
// Deterministic review controls: the running application, never a video surrogate.
Object.assign(window, {
  rhine: {
    // The review button supplies a real user activation. Preferences stay local to this preview.
    playBootPreview: async (music = false) => {
      if (!ready || !navigator.userActivation.isActive) return false;
      const request = ++audioPreviewRequest;
      audioPreview = true;
      audio.configure({ ...prefs, sound: true, music });
      const unlocked = await audio.unlock();
      if (request !== audioPreviewRequest) return false;
      if (!unlocked) {
        audioPreview = false;
        configureAudio();
        return false;
      }
      replayBoot(true);
      return true;
    },
    seek: (t: number) => {
      setMode("boot");
      bootStart = performance.now() / 1000 - t;
      lastStep = "";
    },
    archive: () => setMode("archive"),
    detail: () => openFile(),
    select: (i: number) => select(i),
    // Controller state, for the settings panel and for scripted checks.
    gamepad: () => ({ enabled: prefs.gamepad, rumble: prefs.gamepadRumble, focusing: gamepadBridge.focusing(), ...gamepadBridge.status() }),
    stats: () => ({
      ...scene?.getStats(),
      runtime: runtime.snapshot(),
      fps: Math.round(fps),
      mode,
      ready,
      startup: started ? "started" : entry?.phase ?? "loading",
      motion: { reduced: motionIsReduced(), preset: prefs.motionPreset },
      bootTime: mode === "boot" ? started ? (frozenTime ?? performance.now() / 1000 - bootStart) + 5 : 6.76 : null,
      selected: records[selected].id,
      saved: [...saved],
      audio: audio.stats(),
      albumAudio: albumPlayer.getStats(),
    }),
  },
});
if (import.meta.hot) import.meta.hot.dispose(() => audio.dispose());

