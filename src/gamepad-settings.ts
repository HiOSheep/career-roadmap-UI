import {
  backLabels,
  confirmLabels,
  familyLabels,
  menuLabels,
  type GamepadStatus,
} from "../packages/gamepad-input/src/index";
import { escapeHtml } from "./html";
import "./gamepad-settings.css";

export type GamepadPreferences = { gamepad: boolean; gamepadRumble: boolean };

/** Pads report a long vendor string; the panel only needs enough to identify it. */
function shortId(id: string) {
  return id.replace(/\s*\(.*?\)\s*/g, " ").trim().slice(0, 42);
}

export function gamepadSettingsMarkup(prefs: GamepadPreferences, status: GamepadStatus) {
  const family = status.family;
  const state = status.connected && family
    ? `<b>${familyLabels[family]} 已连接</b><small>${escapeHtml(shortId(status.id ?? ""))}</small>`
    : `<b>未连接</b><small>连接 PS 或 Xbox 手柄后按任意键即可识别</small>`;
  return `<section class="gamepad-settings" id="gamepad-settings"><h3>GAMEPAD <span>手柄</span></h3><div class="gamepad-status" role="status">${state}</div><div class="settings-list"><label><div><strong>CONTROLLER INPUT</strong><span>左摇杆与十字键＝方向键，${confirmLabels[family ?? "xbox"]} 确认，${backLabels[family ?? "xbox"]} 返回，${menuLabels[family ?? "xbox"]} 打开本面板</span></div><input type="checkbox" data-pref="gamepad" ${prefs.gamepad ? "checked" : ""}/><i class="toggle"></i></label><label><div><strong>HAPTICS</strong><span>移动与确认时的轻微震动；浏览器或手柄不支持时自动忽略</span></div><input type="checkbox" data-pref="gamepadRumble" ${prefs.gamepadRumble ? "checked" : ""}/><i class="toggle"></i></label></div><p class="gamepad-map">左摇杆 / 十字键 移动 · ${family ? confirmLabels[family] : "A"} 确认 · ${family ? backLabels[family] : "B"} 返回 · 菜单键 设置 · 右摇杆 滚动 · LB / RB 切歌 · X 播放暂停 · Y 打开选中框（只用一只手柄即可操作全部控件，使用手柄时鼠标光标自动隐藏）· 支持热插拔</p></section>`;
}
