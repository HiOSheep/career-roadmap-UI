import audioConfig from "../content/album-audio.json" with { type: "json" };
import { albumForMonth } from "./albums";
import { assetUrl } from "./asset-url";

export class AlbumPlayer {
  private voices: HTMLAudioElement[] = [];
  private current?: HTMLAudioElement;
  private ticket = 0;
  private frame = 0;
  private month = -1;
  private track = 0;
  private enabled = false;
  private volume = .5;
  private unlocked = false;
  private started = false;
  private userPaused = false;
  private resumeOffset = 0;
  private duration = 0;
  /** The page went away, so the song is waiting rather than paused by the user. */
  private away = false;
  onRequestPlayback?: () => void;
  /** Fired whenever the playback status changes: the terminal ducks the ambient loop with it. */
  onStatusChange?: (status: string) => void;
  private status = "waiting-for-audio";
  private events = new AbortController();
  private fadeSeconds: number;

  constructor(private sources: { fadeSeconds: number; albums: Record<string, (string | null)[]> } = audioConfig) {
    this.fadeSeconds = Math.max(.1, this.sources.fadeSeconds);
    const unlock = () => { this.unlocked = true; if (!this.started && !this.userPaused) void this.play(this.track); };
    document.addEventListener("pointerdown", unlock, { signal: this.events.signal });
    document.addEventListener("keydown", unlock, { signal: this.events.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.suspend();
      else this.resume();
    }, { signal: this.events.signal });
  }
  /**
   * Leaving the page: remember exactly where the song was, then stop sounding.
   * A fade would be prettier but `requestAnimationFrame` does not run in a hidden
   * page, so the voices pause — and the volume — right here.
   */
  suspend() {
    if (this.status !== "playing" && this.status !== "loading") return;
    this.away = true;
    this.resumeOffset = this.current?.currentTime ?? this.resumeOffset;
    this.duration = this.current && Number.isFinite(this.current.duration) ? this.current.duration : this.duration;
    this.ticket++;
    cancelAnimationFrame(this.frame);
    this.voices.forEach(voice => { voice.pause(); voice.volume = 0; });
    this.current = undefined;
    this.started = false;
    this.setStatus("paused");
  }
  /** Back in view: pick the song up where it stopped instead of starting it over. */
  resume() {
    if (!this.away) return;
    this.away = false;
    if (!this.userPaused && this.enabled && !document.hidden) void this.play(this.track);
  }
  private setStatus(next: string) {
    if (this.status === next) return;
    this.status = next;
    this.onStatusChange?.(next);
  }
  configure(enabled: boolean, volume: number) {
    const changed = this.enabled !== enabled;
    this.enabled = enabled; this.volume = Math.max(0, Math.min(1, volume));
    if (!enabled) {
      this.ticket++; this.current = undefined; this.started = false; this.fade();
      // Disabled (the opening plays its own music): no song is sounding, so the
      // ambient loop is free to take the speakers.
      this.setStatus(this.playlist()[this.track] ? "paused" : "waiting-for-audio");
    }
    // Never start a second load of the same track: while one is in flight
    // `started` is still false, and a second `play()` would take a higher ticket,
    // cancel the first — and, with it, the position it was seeking to.
    else if ((changed || !this.started) && !this.userPaused && this.status !== "loading") void this.play(this.track);
    else this.fade();
  }
  select(month: number) {
    if (month === this.month) return;
    this.userPaused = false; this.resumeOffset = 0; this.duration = 0;
    this.month = month; this.track = Math.max(0, this.playlist().findIndex(url => !!url)); this.started = false;
    void this.play(this.track);
  }
  toggle() {
    if (this.status === "playing" || this.status === "loading") {
      // Pausing while a load is still in flight has no element yet: keep whatever
      // position we were resuming to instead of dropping back to the start.
      this.resumeOffset = this.current?.currentTime ?? this.resumeOffset;
      this.userPaused = true; this.ticket++; this.current = undefined; this.started = false;
      this.setStatus("paused"); this.fade();
    } else {
      this.userPaused = false; this.unlocked = true; this.enabled = true;
      // The host's request usually re-configures the player, and `configure()` starts
      // the track itself — starting it here as well would load it twice, and the
      // second load begins at 0 because the first one claimed the resume position.
      this.onRequestPlayback?.();
      if (this.status !== "loading" && this.status !== "playing") void this.play(this.track);
    }
  }
  selectTrack(index: number) {
    const count = albumForMonth(this.month)?.tracks.length ?? 0;
    if (!count) return;
    this.track = ((index % count) + count) % count;
    this.resumeOffset = 0; this.userPaused = false; this.duration = 0;
    void this.play(this.track);
  }
  step(direction: number) { this.selectTrack(this.track + direction); }
  hasTrack(index: number) { return Boolean(this.playlist()[index]); }
  seek(seconds: number) {
    const duration = this.getStats().duration;
    if (!Number.isFinite(seconds) || duration <= 0) return;
    const time = Math.max(0, Math.min(duration, seconds));
    if (this.current) this.current.currentTime = time;
    else this.resumeOffset = time;
  }
  playTrack(index: number) {
    if (!Number.isInteger(index) || !this.hasTrack(index)) return;
    this.unlocked = true;
    this.selectTrack(index);
    if (this.status !== "playing" && this.status !== "loading") this.toggle();
  }
  private playlist() {
    const album = albumForMonth(this.month);
    return album ? (this.sources.albums[album.id] ?? []) : [];
  }
  private async play(track: number) {
    const ticket = ++this.ticket;
    const playlist = this.playlist();
    const path = playlist[track];
    this.track = track;
    if (!path || !this.enabled || !this.unlocked || document.hidden) {
      this.current = undefined; this.started = false;
      this.setStatus(path ? "paused" : "waiting-for-audio");
      this.fade(); return;
    }
    const audio = new Audio(/^https?:\/\//.test(path) ? path : assetUrl(path));
    audio.preload = "auto"; audio.volume = 0;
    const cleanup = () => { audio.pause(); audio.removeAttribute("src"); audio.load(); };
    // Seek before playing: a resumed song must never begin at 0, not even for the
    // one frame it would take to correct it afterwards. The offset is only released
    // once it has landed, so a second load racing this one resumes in the same place
    // instead of starting over.
    const offset = this.resumeOffset;
    if (offset) audio.addEventListener("loadedmetadata", () => { audio.currentTime = offset; this.resumeOffset = 0; }, { once: true });
    try {
      this.setStatus("loading");
      await audio.play();
      if (ticket !== this.ticket) { cleanup(); return; }
      // Belt and braces: if metadata never arrived the element is still at 0.
      if (offset && Math.abs(audio.currentTime - offset) > .5) audio.currentTime = offset;
      if (offset) this.resumeOffset = 0;
      const updateDuration = () => {
        if (this.current === audio && Number.isFinite(audio.duration)) this.duration = audio.duration;
      };
      audio.addEventListener("loadedmetadata", updateDuration);
      this.voices.push(audio); this.current = audio; this.started = true; this.setStatus("playing");
      updateDuration();
      let advancing = false;
      const next = () => {
        if (advancing || this.current !== audio) return;
        advancing = true;
        const next = playlist.findIndex((url, i) => i > track && !!url);
        const first = playlist.findIndex(url => !!url);
        void this.play(next < 0 ? first : next);
      };
      audio.addEventListener("timeupdate", () => { if (Number.isFinite(audio.duration) && audio.duration-audio.currentTime <= this.fadeSeconds) next(); });
      audio.addEventListener("ended", next);
      this.fade();
    } catch (error) {
      cleanup();
      if (ticket === this.ticket) {
        this.current = undefined; this.started = false;
        // A refused autoplay is not a missing file: keep the track armed so the
        // first real gesture starts it, instead of telling the player it has no audio.
        const refused = (error as DOMException)?.name === "NotAllowedError";
        this.setStatus(refused ? "paused" : "audio-unavailable");
        this.fade();
      }
    }
  }
  private fade() {
    cancelAnimationFrame(this.frame);
    const start = performance.now();
    const gains = this.voices.map(audio => ({ audio, from: audio.volume, to: audio === this.current && this.enabled ? this.volume : 0 }));
    const tick = () => {
      const progress = Math.min(1, (performance.now()-start)/(this.fadeSeconds*1000));
      for (const {audio, from, to} of gains) audio.volume = from + (to-from)*progress;
      if (progress < 1) this.frame = requestAnimationFrame(tick);
      else for (const {audio, to} of gains) if (to === 0 && audio !== this.current) {
        audio.pause(); audio.removeAttribute("src"); audio.load();
        this.voices = this.voices.filter(voice => voice !== audio);
      }
    };
    tick();
  }
  getStats() { return { month: this.month, track: this.track+1, status: this.status, fadeSeconds: this.fadeSeconds, activeVoices: this.voices.length, availableTracks: this.playlist().filter(Boolean).length,
    currentTime: this.current?.currentTime ?? this.resumeOffset, duration: this.duration }; }
  dispose() {
    this.ticket++; this.events.abort(); cancelAnimationFrame(this.frame);
    this.voices.forEach(audio => { audio.pause(); audio.removeAttribute("src"); audio.load(); });
    this.voices = []; this.current = undefined;
    // Teardown stays silent: notifying here would restart the ambient loop on the
    // way out of a page that is being unloaded anyway.
    this.status = "paused";
  }
}
