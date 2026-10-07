import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const browser = await chromium.launch({channel:"msedge",headless:true});
try {
  const page = await browser.newPage();
  await page.route("**/audio-test", route => route.fulfill({contentType:"text/html",body:"<html><body>Audio interface test</body></html>"}));
  await page.goto("http://127.0.0.1:5199/audio-test");
  const result = await page.evaluate(async () => {
    const { AlbumPlayer } = await import("/src/album-player.ts");
    const { albumForMonth } = await import("/src/albums.ts");
    const NativeAudio = window.Audio;
    const voices = [];
    class FakeAudio extends EventTarget {
      volume = 1; paused = true; duration = 60; currentTime = 0;
      constructor(src) { super(); this.src = src; voices.push(this); }
      async play() { this.paused = false; }
      pause() { this.paused = true; }
      removeAttribute() { this.src = ""; }
      load() {}
    }
    window.Audio = FakeAudio;
    // Derive the ids from the content instead of naming months: the album catalogue
    // has been reordered before, which silently broke this fixture. Months 0 and 1
    // get audio; month 2 deliberately has none, to cover a silent month.
    const withAudio = [0, 1].map(index => albumForMonth(index)?.id).filter(Boolean);
    const albums = Object.fromEntries(withAudio.map(id => [id, ["album-audio/test-a.wav"]]));
    const player = new AlbumPlayer({fadeSeconds:.3,albums});
    // The terminal wires this to `configure()` (it also switches the ambient loop
    // off), and that path used to start the track a second time — from zero.
    player.onRequestPlayback = () => player.configure(true, .6);
    const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
    try {
      player.select(0); player.configure(true,.6);
      document.dispatchEvent(new PointerEvent("pointerdown"));
      await wait(350);
      const initial = voices.at(-1).volume;
      voices.at(-1).currentTime = 12;
      player.toggle(); await wait(350);
      const paused = player.getStats().status;
      const voicesBeforeResume = voices.length;
      player.toggle(); await wait(350);
      const resumedAt = voices.at(-1).currentTime;
      // Resuming must load the track exactly once: a second load would begin at 0 and
      // win the race, which is the "restarts after pause" bug this covers.
      const resumedVoices = voices.length - voicesBeforeResume;
      const outgoing = voices.at(-1);
      player.select(1); await wait(110);
      const crossfade = voices.filter(voice => !voice.paused).map(voice => voice.volume);
      const before = crossfade[0];
      player.select(0); await wait(10);
      const after = outgoing.volume;
      await wait(350);
      const settled = voices.filter(voice => !voice.paused).map(voice => voice.volume);
      player.select(2); await wait(350);
      const pendingStats = player.getStats();

      // Leaving the page must pause in place — not start the song over — and the
      // page must be silent immediately, since rAF fades do not run while hidden.
      player.select(0); player.configure(true,.6);
      await wait(350); // select() starts the load asynchronously; wait for its voice.
      const voice = voices.at(-1);
      voice.paused = false; voice.volume = .6; voice.currentTime = 25;
      Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
      document.dispatchEvent(new Event("visibilitychange"));
      const away = { status: player.getStats().status, paused: voice.paused, volume: voice.volume, at: player.getStats().currentTime };
      Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});
      document.dispatchEvent(new Event("visibilitychange"));
      await wait(120);
      const back = { status: player.getStats().status, at: voices.at(-1).currentTime, fresh: voices.at(-1) !== voice };

      // A refused autoplay is not a missing file: the track stays armed.
      const refusing = window.Audio;
      class BlockedAudio extends refusing {
        async play() { throw Object.assign(new Error("blocked"), { name: "NotAllowedError" }); }
      }
      window.Audio = BlockedAudio;
      player.configure(false,.6); player.configure(true,.6);
      await wait(80);
      const refused = player.getStats().status;
      class BrokenAudio extends refusing {
        async play() { throw Object.assign(new Error("decode"), { name: "NotSupportedError" }); }
      }
      window.Audio = BrokenAudio;
      player.select(1); // another month, so the load is attempted again
      await wait(80);
      const unavailable = player.getStats().status;
      window.Audio = refusing;

      return {initial,paused,resumedAt,resumedVoices,crossfade,before,after,settled,pending:pendingStats,playing:voices.filter(voice => !voice.paused).length,away,back,refused,unavailable};
    } finally { player.dispose(); window.Audio = NativeAudio; }
  });
  assert.ok(Math.abs(result.initial-.6)<.01);
  assert.equal(result.paused,"paused");
  assert.equal(result.resumedAt,12,"Resuming a paused track continues at the paused second");
  assert.equal(result.resumedVoices,1,"…by loading it once, not twice (a second load would start at 0)");
  assert.equal(result.crossfade.length,2);
  assert.ok(result.crossfade.every(gain => gain>0 && gain<.6));
  assert.ok(Math.abs(result.after-result.before)<.1,"Rapid reversal preserves current volume instead of jumping");
  assert.equal(result.settled.length,1);
  assert.ok(Math.abs(result.settled[0]-.6)<.01);
  assert.equal(result.pending.status,"waiting-for-audio");
  assert.equal(result.playing,0);
  assert.equal(result.away.status,"paused","Leaving the page pauses the song");
  assert.equal(result.away.paused,true,"…by pausing the voice immediately, not by fading it");
  assert.equal(result.away.volume,0,"…and muting it at once, since rAF does not run while hidden");
  assert.equal(result.away.at,25,"…while remembering the second it stopped at");
  assert.equal(result.back.status,"playing","Coming back resumes the song");
  assert.equal(result.back.at,25,"…from the same second, never from 0");
  assert.equal(result.refused,"paused","A refused autoplay keeps the track armed instead of reporting missing audio");
  assert.equal(result.unavailable,"audio-unavailable","A real load failure still reports missing audio");
  console.log("Audio interface passed: fade-in, overlap crossfade, rapid reversal, cleanup and silent pending months; suspend/resume in place across a hidden page; refused autoplay distinguished from missing audio (mock media; real recordings not supplied).");
} finally { await browser.close(); }
