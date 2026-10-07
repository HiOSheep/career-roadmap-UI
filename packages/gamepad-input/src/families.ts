/**
 * Which family a connected pad belongs to. The Gamepad API only hands out a
 * free-form `id` string, so the vendor/product pairs Chrome and Firefox report
 * are matched here — Sony (054c) and Microsoft (045e) cover the pads this
 * terminal targets, everything else keeps the standard mapping.
 */
export type GamepadFamily = "xbox" | "playstation" | "standard";

const XBOX = /(045e|xbox|xinput|microsoft)/i;
const SONY = /(054c|dualsense|dualshock|playstation|\bps[3-5]\b)/i;
/**
 * Chrome reports an Xbox pad as "Xbox Wireless Controller" and a DualShock 4 as
 * a bare "Wireless Controller", so the Microsoft tokens are matched first — the
 * generic Sony name would otherwise claim every Xbox pad.
 */
const SONY_WITHOUT_VENDOR = /^\s*wireless controller/i;

export function detectFamily(id: string): GamepadFamily {
  if (XBOX.test(id)) return "xbox";
  if (SONY.test(id) || SONY_WITHOUT_VENDOR.test(id)) return "playstation";
  return "standard";
}

export const familyLabels: Record<GamepadFamily, string> = {
  xbox: "Xbox 手柄",
  playstation: "PS 手柄",
  standard: "标准手柄",
};

/** Face-button names, so hints can name the button that is actually under the thumb. */
export const confirmLabels: Record<GamepadFamily, string> = {
  xbox: "A",
  playstation: "×",
  standard: "A",
};

export const backLabels: Record<GamepadFamily, string> = {
  xbox: "B",
  playstation: "○",
  standard: "B",
};

export const menuLabels: Record<GamepadFamily, string> = {
  xbox: "菜单键",
  playstation: "Options",
  standard: "Start",
};
