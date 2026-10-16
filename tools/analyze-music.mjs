// Decodes Kenney music loops in a headless browser and prints rough
// "energy" metrics so loops can be chosen per game phase.
//   node tools/analyze-music.mjs "<dir under project root>"
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirs = process.argv.slice(2);
const files = dirs.flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(".ogg")).map((f) => `${d}/${f}`));

const server = await createServer({ root, logLevel: "error", server: { port: 5198 } });
await server.listen();
const base = `http://localhost:${server.httpServer.address().port}/`;
const browser = await puppeteer.launch({
  executablePath: ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((b) => fs.existsSync(b)),
  headless: true
});
const page = await browser.newPage();
await page.goto(base + "tools/render.html");

const rows = [];
for (const f of files) {
  const url = base + f.split("/").map(encodeURIComponent).join("/");
  const r = await page.evaluate(async (u) => {
    const buf = await (await fetch(u)).arrayBuffer();
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const audio = await ctx.decodeAudioData(buf);
    const d = audio.getChannelData(0);
    const sr = audio.sampleRate;
    let sum = 0, zc = 0, lowSum = 0, low = 0;
    for (let i = 0; i < d.length; i++) {
      sum += d[i] * d[i];
      if (i && (d[i] >= 0) !== (d[i - 1] >= 0)) zc++;
      low += 0.02 * (d[i] - low); // ~140Hz one-pole low-pass
      lowSum += low * low;
    }
    const rms = Math.sqrt(sum / d.length);
    // Onset density: count rises in 23ms-frame energy.
    const hop = Math.floor(sr * 0.023);
    let prev = 0, onsets = 0, frames = 0, energies = [];
    for (let i = 0; i + hop < d.length; i += hop) {
      let e = 0;
      for (let j = i; j < i + hop; j++) e += d[j] * d[j];
      e = Math.sqrt(e / hop);
      energies.push(e);
      if (e > prev * 1.6 && e > rms * 0.6) onsets++;
      prev = e; frames++;
    }
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const varc = Math.sqrt(energies.reduce((a, b) => a + (b - mean) ** 2, 0) / energies.length) / (mean || 1);
    return {
      dur: audio.duration,
      rms,
      zcr: zc / d.length * sr, // crossings/sec, brightness proxy
      lowRatio: Math.sqrt(lowSum / d.length) / (rms || 1),
      onsetsPerSec: onsets / audio.duration,
      dynamics: varc
    };
  }, url);
  rows.push({ f: path.basename(f, ".ogg"), ...r });
}
rows.sort((a, b) => b.rms * b.onsetsPerSec - a.rms * a.onsetsPerSec);
console.log("track".padEnd(26), "dur".padStart(6), "rms".padStart(6), "bright".padStart(7), "bass".padStart(6), "onset/s".padStart(8), "dyn".padStart(6));
for (const r of rows) {
  console.log(r.f.padEnd(26), r.dur.toFixed(1).padStart(6), r.rms.toFixed(3).padStart(6), r.zcr.toFixed(0).padStart(7), r.lowRatio.toFixed(2).padStart(6), r.onsetsPerSec.toFixed(2).padStart(8), r.dynamics.toFixed(2).padStart(6));
}
await browser.close();
await server.close();
