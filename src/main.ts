import Phaser from "phaser";
import "./ui/theme.css";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

function start() {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    backgroundColor: "#2b1260",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: "high-performance"
    },
    fps: { target: 60 },
    disableContextMenu: true,
    scene: [BootScene, GameScene]
  });
}

// Canvas text (damage numbers, speech bubbles) needs the fonts loaded before it first draws.
const fonts = document.fonts.load('400 32px "Jersey 10"').catch(() => undefined);
Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).then(start);
