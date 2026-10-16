import Phaser from "phaser";

export const SFX_FILES = [
  "staple_0", "staple_1", "staple_2", "staple_3", "staple_4",
  "hit_0", "hit_1", "hit_2", "hit_3", "hit_4", "hit_heavy_0", "hit_heavy_1", "hit_heavy_2",
  "step_carpet_0", "step_carpet_1", "step_carpet_2", "step_carpet_3", "step_carpet_4",
  "step_tile_0", "step_tile_1", "step_tile_2", "step_tile_3", "step_tile_4",
  "step_wood_0", "step_wood_1", "step_wood_2", "step_wood_3", "step_wood_4",
  "wall_0", "wall_1", "wall_2", "glass_0", "glass_1", "glass_2", "ping_0", "ping_1", "ping_2",
  "laser_0", "laser_1", "laser_2", "crunch_0", "crunch_1", "crunch_2",
  "wood_heavy_0", "wood_heavy_1", "wood_0", "wood_1", "metal_heavy_0", "metal_heavy_1", "plate_0", "plate_1",
  "splash_0", "splash_1", "boom_0", "boom_1", "fire_0", "fire_1", "computer_0", "computer_1", "hum_0", "hum_1",
  "soft_heavy", "elevator_door", "shredder", "zap_0", "zap_1", "zap_2",
  "powerup_0", "powerup_1", "powerup_2", "powerup_3", "blink", "megaphone", "alert", "levelup", "powerdown",
  "confirm_0", "confirm_1", "tick_0", "tick_1", "click_0", "click_1", "select", "error", "ding",
  "glitch_0", "glitch_1", "switch", "open", "drop", "hover",
  "hurt_0", "hurt_1", "coin_0", "coin_1", "upgrade_0", "upgrade_1", "gameover", "pop", "secret",
  "pickup_0", "pickup_1", "dodge_0", "dodge_1", "reload", "reload_done", "paper_0", "paper_1", "coins", "pot", "place"
];

/** Kenney loops/jingles (.ogg) plus the jam's own tracks (.mp3). */
export const MUSIC_FILES: { key: string; file: string }[] = [
  { key: "lobby", file: "lobby.mp3" }, // Crunch Time (phase 1)
  { key: "fight", file: "fight.mp3" }, // The Downsizing (phase 2)
  { key: "title", file: "title.ogg" },
  { key: "review", file: "review.ogg" },
  { key: "gameover", file: "gameover.ogg" },
  { key: "ident", file: "ident.ogg" },
  { key: "jingle_win", file: "jingle_win.ogg" },
  { key: "jingle_chore", file: "jingle_chore.ogg" },
  { key: "jingle_lose", file: "jingle_lose.ogg" }
];

export const VOICE_FILES = [
  "fight", "prepare_yourself", "multi_kill", "combo", "combo_breaker", "flawless_victory", "game_over", "you_win", "you_lose",
  "round_1", "round_2", "round_3", "round_4", "round_5", "final_round", "sudden_death", "begin", "winner",
  "hurry_up", "time_over", "power_up", "level_up", "new_highscore", "mission_completed", "objective_achieved",
  "war_reloading", "war_fire_in_the_hole", "war_look_out", "go", "ready"
];

export type MusicTrack = "title" | "lobby" | "review" | "fight" | "gameover" | "none";

const TRACK_GAIN: Record<MusicTrack, number> = { title: 0.55, lobby: 0.7, review: 0.6, fight: 0.75, gameover: 0.6, none: 0 };
const SETTINGS_KEY = "hostile-takeover-audio";

/** Groups variant files (staple_0..4) under one name and plays them with pitch jitter. */
export class AudioManager {
  private scene: Phaser.Scene;
  private groups = new Map<string, string[]>();
  private lastPlayed = new Map<string, number>();
  private music: Phaser.Sound.BaseSound | null = null;
  private musicName: MusicTrack = "none";
  sfxVolume = 0.8;
  musicVolume = 0.6;
  muted = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    for (const f of SFX_FILES) {
      const base = f.replace(/_\d+$/, "");
      if (!this.groups.has(base)) this.groups.set(base, []);
      this.groups.get(base)!.push(`sfx_${f}`);
    }
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (saved) {
        this.sfxVolume = saved.sfx ?? this.sfxVolume;
        this.musicVolume = saved.music ?? this.musicVolume;
        this.muted = !!saved.muted;
      }
    } catch { /* storage unavailable */ }
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sfx: this.sfxVolume, music: this.musicVolume, muted: this.muted }));
    } catch { /* ignore */ }
  }

  private targetVolume(t: MusicTrack) {
    return this.muted ? 0 : this.musicVolume * TRACK_GAIN[t];
  }

  applyVolumes() {
    if (this.music) (this.music as Phaser.Sound.WebAudioSound).setVolume(this.targetVolume(this.musicName));
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolumes();
    this.saveSettings();
  }

  play(name: string, opts: { vol?: number; rate?: number; jitter?: number; minGap?: number } = {}) {
    if (this.muted || this.sfxVolume <= 0) return;
    const keys = this.groups.get(name);
    if (!keys) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? 0) < (opts.minGap ?? 30)) return;
    this.lastPlayed.set(name, now);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const jitter = opts.jitter ?? 0.08;
    const rate = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);
    this.scene.sound.play(key, { volume: (opts.vol ?? 0.5) * this.sfxVolume, rate });
  }

  voice(name: string, vol = 0.9) {
    if (this.muted) return;
    this.scene.sound.play(`voice_${name}`, { volume: vol * Math.max(0.4, this.sfxVolume) });
  }

  jingle(name: string, vol = 0.7) {
    if (this.muted) return;
    this.scene.sound.play(`music_${name}`, { volume: vol * this.musicVolume });
  }

  /** Crossfades to a looping track. */
  setMusic(track: MusicTrack, fade = 0.8) {
    if (track === this.musicName) return;
    const prev = this.music;
    if (prev) {
      // Kill any fade still running on this track before fading it out, or a
      // leftover fade-in would keep writing to it after it's destroyed.
      this.scene.tweens.killTweensOf(prev);
      this.scene.tweens.add({
        targets: prev, volume: 0, duration: fade * 1000,
        onComplete: () => { this.scene.tweens.killTweensOf(prev); prev.stop(); prev.destroy(); }
      });
    }
    this.music = null;
    this.musicName = track;
    if (track === "none" || !this.scene.cache.audio.exists(`music_${track}`)) return;
    const snd = this.scene.sound.add(`music_${track}`, { loop: true, volume: 0 });
    snd.play();
    this.scene.tweens.add({ targets: snd, volume: this.targetVolume(track), duration: track === "fight" ? 250 : 900 });
    this.music = snd;
  }

  /** Speeds the lobby track up as 5 PM approaches. */
  setMusicRate(rate: number) {
    if (this.music) (this.music as Phaser.Sound.WebAudioSound).setRate(rate);
  }

  /** Ducks music under the 5 PM announcement. */
  duck(amount: number, seconds: number) {
    if (!this.music) return;
    const m = this.music;
    const full = this.targetVolume(this.musicName);
    this.scene.tweens.killTweensOf(m);
    this.scene.tweens.add({ targets: m, volume: full * amount, duration: 200, yoyo: true, hold: seconds * 1000 });
  }
}
