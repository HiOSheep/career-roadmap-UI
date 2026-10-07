# Career planner gamepad input

Controller input for the career roadmap terminal: PlayStation and Xbox pads,
hot swap, stick/D-pad navigation, a visible selection frame for mouse-free
operation, scrolling and haptics.

It is a plain source package inside this repository — no workspace install, no
runtime dependencies. The terminal imports it directly:

```ts
import { attachGamepad } from "../../packages/gamepad-input/src/index";
```

## What a controller does here

| Controller | Terminal |
| --- | --- |
| Left stick / D-pad | Arrow keys (held directions auto-repeat after 320 ms, then every 110 ms) — or the selection frame while it is open |
| `A` / `×` (button 0) | `Enter`: read the selected file; inside a panel, activate the framed control |
| `B` / `○` (button 1) | `Escape`: leave the detail view, close the open panel; with the frame open outside a panel, put it away |
| `X` / `□` (button 2) | Play / pause the album (detail view) |
| `Y` / `△` (button 3) | Show the selection frame, so every control is reachable without a mouse |
| `LB` / `RB` (buttons 4/5) | Previous / next track (detail view) |
| Menu / Options / Start (button 9) | Opens the settings panel |
| Right stick | Scrolls whatever scrolls in the current view (open panel, detail column, page) |

Both families share the W3C standard mapping; the family only changes the labels
(`A`/`B` vs `×`/`○`) and which haptic API the pad answers to.

While the pad is the device in hand the pointer steps aside: the terminal hides
the system cursor and its own cursor ring until the mouse moves again.

## Behaviour worth knowing

- **Hot swap.** A pad takes over on a *new* button press or when its stick first
  leaves the dead zone. Putting one pad down while another is held does not fight
  over the UI, and unplugging the active pad hands over to what is still
  connected — even when the replacement reuses the same index.
- **Dead zones.** Sticks need 0.35 of travel to press and stay pressed down to
  0.25, so a stick resting on the edge does not chatter. The right stick ignores
  anything under 0.18 and rescales past that, so the first pixel of movement
  responds.
- **One-shot buttons.** Face buttons and shoulders fire on the press edge only.
- **Focus is delegated.** The package never guesses what navigation means: the
  host can take directions, confirm and back over (`onNavigate`, `onConfirm`,
  `onBack`), which is how the terminal swaps between "arrow keys" and its visible
  selection frame.
- **Scrolling is programmatic.** Synthetic `wheel` events are not trusted and
  never scroll, so the host scrolls the target element itself.
- **Haptics.** `dual-rumble` through `vibrationActuator`, falling back to the older
  `hapticActuators[].pulse`. A step ticks lightly, the first step of a direction
  ticks harder than its repeats, confirm lands harder than back, and scrolling is
  silent.

## API

```ts
// Pure, DOM-free engine: deterministic, unit tested.
const router = new GamepadRouter({ stickDeadzone, repeatDelayMs, repeatIntervalMs, scrollDeadzone });
const actions = router.update(navigator.getGamepads(), performance.now()); // GamepadAction[]
router.active; // { index, id, family } | null

// Spatial focus search for a selection frame, also pure.
nextFocusIndex(rects, currentIndex, "down");

// Browser side: polls the pads, delivers actions, plays haptics.
const handle = attachGamepad({
  enabled: () => prefs.gamepad,
  rumbleEnabled: () => prefs.gamepadRumble,
  scrollTarget: () => elementOrNull,
  onNavigate: (direction, repeat) => false,   // true = the host handled it
  onConfirm: () => false,
  onBack: () => false,
  onTransport: (control) => {},               // "prev" | "next" | "toggle"
  onStatus: (status, reason) => {},
  onAction: (action) => {},
  scrollSpeed: 26,
});
handle.status();
handle.stop();
```

`GamepadStatus` is `{ connected, family, id, index }`; `GamepadFamily` is
`"playstation" | "xbox" | "standard"`.

## Tests

```sh
# Engine, spatial focus, mapping and haptics — no browser needed.
node --experimental-strip-types scripts/check-gamepad.mjs

# The delivered behaviour in a real browser (Playwright, like the other checks).
node scripts/check-gamepad-browser.mjs
```

The unit file covers family detection and labels, dead zones with hysteresis,
D-pad and left-stick edges with auto-repeat, one-shot face/shoulder buttons,
right-stick scrolling, hot swap between two pads and to nothing, spatial focus
navigation, and the haptic pattern per action. The browser file drives an
injected pad through the running terminal and asserts what the player sees.
