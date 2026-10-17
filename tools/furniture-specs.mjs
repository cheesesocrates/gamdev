// Sprite specs for tools/render-assets.mjs.
// Every sprite is rendered from Kenney 3D kits (CC0) with a 30° top-down
// camera, recoloured into an office palette. Re-run with:
//   node tools/render-assets.mjs render
const M = (kit, name) => `/tools/models/${kit}/${name}.glb`;

export const RENDER_OPTS = { ppu: 150, pitchDeg: 30, ss: 3, outline: "rgba(18,16,28,0.55)", outlineWidth: 1.5, shadowOpacity: 0.26 };

// ---- palette ----
const DESK_WHITE = { wood: "#e4e7ec", metal: "#4d5562" };
const WALNUT = { wood: "#6b4631", woodDark: "#4d3122", metal: "#2a2e35" };
const CARDBOARD = { wood: "#c8955b", woodDark: "#a5743f" };
const MESH_BLACK = { carpet: "#2d323c", metalMedium: "#6c7480" };
const OXBLOOD = { carpet: "#6a2427", metalMedium: "#2a2e35" };
const NAVY = { carpetBlue: "#2f4a7a", carpet: "#2f4a7a", metal: "#c9ced6", wood: "#2b2f36" };
const ORANGE_SOFA = { carpet: "#e07a3f", wood: "#3a2b22" };
const WHITE_KITCHEN = { wood: "#eef0f3", woodDark: "#cfd4da", metal: "#9aa3ad" };
const GREY_CAB = { wood: "#8e98a6", metal: "#d6dbe2", woodDark: "#6f7988" };
const PLANT = { wood: "#eceff2", woodDark: "#c6ccd3", plant: "#3daa69" };

// Desk-local helpers (Kenney desk: x 0..0.72, top y=0.38, back z=-0.38, front z=0)
const TOP = 0.38;
const monitor = (x = 0.16) => ({ model: M("furniture", "computerScreen"), pos: [x, TOP, -0.25], mat: { metalDark: "#1d2129", metal: "#3a3f48" } });
const keyboard = (x = 0.215) => ({ model: M("furniture", "computerKeyboard"), pos: [x, TOP, -0.07], mat: { metalDark: "#2a2e35", metal: "#4a505b" } });
const mouse = (x = 0.56) => ({ model: M("furniture", "computerMouse"), pos: [x, TOP, -0.08] });
const mug = (x = 0.08, z = -0.12) => ({ model: M("food", "mug"), pos: [x, TOP, z], scale: 0.2 });
const papers = (x = 0.6, z = -0.24) => ({ prim: "box", size: [0.1, 0.012, 0.13], color: "#f5f3ea", pos: [x, TOP, z] });
const deskBase = (mat = DESK_WHITE) => ({ model: M("furniture", "desk"), mat });

export const SPECS = [
  // ---------------- workstations (sitter faces north at rot 0) ----------------
  { key: "ws_a", rots: [0, 180], parts: [deskBase(), monitor(), keyboard(), mouse(), mug()] },
  { key: "ws_b", rots: [0, 180], parts: [deskBase(), monitor(0.05), monitor(0.33), keyboard(), mouse(0.6), { model: M("furniture", "plantSmall1"), pos: [0.66, TOP, -0.3], mat: PLANT }] },
  { key: "ws_c", rots: [0, 180], parts: [deskBase(), { model: M("furniture", "laptop"), pos: [0.22, TOP, -0.06], mat: { metalDark: "#2a2e35", metal: "#b8bfc8" } }, { model: M("furniture", "books"), pos: [0.04, TOP, -0.3] }, papers(), mug(0.58, -0.1)] },
  { key: "ws_hr", rots: [0], parts: [deskBase(GREY_CAB), monitor(0.12), keyboard(0.17), papers(0.55, -0.26), papers(0.56, -0.25), { model: M("furniture", "books"), pos: [0.52, TOP, -0.1] }] },
  {
    key: "exec_desk", rots: [0], parts: [
      { model: M("furniture", "deskCorner"), mat: WALNUT, scale: 1.15 },
      { model: M("furniture", "computerScreen"), pos: [0.28, 0.437, -0.98], mat: { metalDark: "#1d2129", metal: "#2a2e35" } },
      { model: M("furniture", "computerKeyboard"), pos: [0.33, 0.437, -0.82] },
      { model: M("furniture", "laptop"), pos: [0.8, 0.437, -0.45], rotY: -90, mat: { metalDark: "#2a2e35", metal: "#d9b25f" } },
      { model: M("food", "mug"), pos: [0.12, 0.437, -0.85], scale: 0.2 },
      { model: M("furniture", "plantSmall2"), pos: [1.0, 0.437, -1.0], mat: PLANT }
    ]
  },
  {
    key: "reception", rots: [0], parts: [
      { model: M("furniture", "kitchenBar"), pos: [0, 0, 0], mat: WALNUT },
      { model: M("furniture", "kitchenBar"), pos: [0.43, 0, 0], mat: WALNUT },
      { model: M("furniture", "kitchenBar"), pos: [0.86, 0, 0], mat: WALNUT },
      { model: M("furniture", "computerScreen"), pos: [0.5, 0.42, -0.16], rotY: 180, mat: { metalDark: "#1d2129", metal: "#2a2e35" } },
      { model: M("furniture", "plantSmall3"), pos: [1.15, 0.42, -0.1], mat: PLANT }
    ]
  },

  // ---------------- chairs ----------------
  { key: "chair_office", rots: [0, 90, 180, 270], parts: [{ model: M("furniture", "chairDesk"), mat: MESH_BLACK }] },
  { key: "chair_exec", rots: [0, 180], parts: [{ model: M("furniture", "chairDesk"), mat: OXBLOOD, scale: 1.15 }] },
  { key: "chair_conf", rots: [0, 90, 180, 270], parts: [{ model: M("furniture", "chairModernCushion"), mat: { carpetBlue: "#3a4d6e", metal: "#c9ced6" }, scale: 1.25 }] },
  { key: "stool", rots: [0], parts: [{ model: M("furniture", "stoolBar"), mat: { wood: "#2a2e35", carpet: "#c43d3d" } }] },

  // ---------------- storage / decor ----------------
  { key: "filing", rots: [0], parts: [{ model: M("furniture", "bookcaseClosedDoors"), mat: GREY_CAB }] },
  { key: "bookcase", rots: [0], parts: [{ model: M("furniture", "bookcaseClosedWide"), mat: WALNUT }] },
  { key: "plant", scale: 1.2, rots: [0], parts: [{ model: M("furniture", "pottedPlant"), mat: PLANT, scale: 1.15 }] },
  { key: "trash", scale: 1.1, rots: [0], parts: [{ model: M("furniture", "trashcan"), mat: { metal: "#5c6470", metalDark: "#3e444e" } }] },
  { key: "coatrack", rots: [0], parts: [{ model: M("furniture", "coatRackStanding"), mat: { wood: "#3a2b22", woodDark: "#2a1f19" } }] },
  { key: "lamp", rots: [0], parts: [{ model: M("furniture", "lampRoundFloor") }] },
  { key: "tv", rots: [0], parts: [{ model: M("furniture", "televisionModern"), scale: 1.5, mat: { metalDark: "#1d2129", metal: "#3a3f48" } }] },
  {
    key: "whiteboard", rots: [0], parts: [
      { prim: "box", size: [0.95, 0.6, 0.03], color: "#a7afba", pos: [0, 0.2, 0] },
      { prim: "box", size: [0.9, 0.55, 0.035], color: "#f7f8fa", pos: [0, 0.225, 0.003] },
      { prim: "box", size: [0.4, 0.02, 0.04], color: "#2f6fd6", pos: [-0.15, 0.6, 0.004] },
      { prim: "box", size: [0.28, 0.02, 0.04], color: "#d93a3a", pos: [0.12, 0.5, 0.004] },
      { prim: "box", size: [0.5, 0.02, 0.04], color: "#2a9d55", pos: [-0.05, 0.4, 0.004] },
      { prim: "box", size: [0.02, 0.62, 0.02], color: "#7c8591", pos: [-0.44, 0, 0.0] },
      { prim: "box", size: [0.02, 0.62, 0.02], color: "#7c8591", pos: [0.44, 0, 0.0] }
    ]
  },

  // ---------------- office equipment (interactables) ----------------
  { key: "copier", rots: [0], opts: { filter: "saturate(0.1) brightness(1.55) contrast(1.05)" }, parts: [{ model: M("factory", "machine"), scale: 0.42 }, { prim: "box", size: [0.22, 0.03, 0.18], color: "#ffffff", pos: [0.12, 0.55, 0.0] }] },
  {
    key: "shredder", scale: 1.2, rots: [0], parts: [
      { model: M("furniture", "trashcan"), mat: { metal: "#3b414b", metalDark: "#2a2e35" }, scale: [1.25, 1.0, 1.25] },
      { prim: "box", size: [0.3, 0.08, 0.3], color: "#23262d", pos: [0, 0.43, 0] },
      { prim: "box", size: [0.2, 0.01, 0.035], color: "#060708", pos: [0, 0.51, 0.02] },
      { prim: "box", size: [0.03, 0.012, 0.03], color: "#3ee07a", emissive: "#3ee07a", pos: [0.1, 0.51, 0.1] }
    ]
  },
  {
    key: "cooler", scale: 1.4, rots: [0], parts: [
      { prim: "box", size: [0.24, 0.42, 0.24], color: "#e9edf2", pos: [0, 0, 0] },
      { prim: "box", size: [0.14, 0.07, 0.02], color: "#8f99a6", pos: [0, 0.27, 0.125] },
      { prim: "cyl", size: [0.21, 0.26, 0.21], color: "#59b8f5", opacity: 0.85, roughness: 0.2, pos: [0, 0.42, 0] },
      { prim: "cyl", size: [0.12, 0.03, 0.12], color: "#2b6cb0", pos: [0, 0.68, 0] }
    ]
  },
  // Hand-drawn now (the kicked-over cooler with its water gushing out): `render` leaves the PNG alone.
  { key: "cooler_tipped", handDrawn: true, scale: 1.4, rots: [0], parts: [
      { prim: "box", size: [0.24, 0.42, 0.24], color: "#e9edf2", pos: [0, 0, 0] },
      { prim: "cyl", size: [0.21, 0.26, 0.21], color: "#59b8f5", opacity: 0.75, roughness: 0.2, pos: [0.24, 0.105, 0.0], rotZ: 90 }
    ] },
  {
    key: "powerstrip", scale: 1.6, rots: [0], parts: [
      { prim: "box", size: [0.36, 0.035, 0.08], color: "#f0f1f3", pos: [0, 0, 0] },
      { prim: "box", size: [0.04, 0.015, 0.04], color: "#e53935", emissive: "#e53935", pos: [-0.14, 0.035, 0] },
      { prim: "box", size: [0.04, 0.008, 0.04], color: "#2a2e35", pos: [-0.06, 0.035, 0] },
      { prim: "box", size: [0.04, 0.008, 0.04], color: "#2a2e35", pos: [0.02, 0.035, 0] },
      { prim: "box", size: [0.04, 0.008, 0.04], color: "#2a2e35", pos: [0.1, 0.035, 0] },
      { prim: "cyl", size: [0.018, 0.018, 0.3], color: "#2a2e35", pos: [0.32, 0.0, 0.0] }
    ]
  },
  { key: "server", rots: [0], parts: [{ model: M("station", "computer-system"), scale: 1.05 }] },
  { key: "server_console", rots: [0], parts: [{ model: M("station", "computer-wide"), scale: 1.0 }] },
  { key: "generator", rots: [0], parts: [{ model: M("space", "machine_generator") }] },
  { key: "antenna", rots: [0], parts: [{ model: M("space", "machine_wireless"), scale: 0.9 }] },
  { key: "supply_shelf", rots: [0], parts: [{ model: M("market", "shelf-boxes"), scale: 0.95 }] },
  { key: "vending", rots: [0], parts: [{ model: M("arcade", "vending-machine"), scale: 1.15 }] },
  { key: "vending_b", rots: [0], opts: { filter: "hue-rotate(195deg) saturate(1.1)" }, parts: [{ model: M("arcade", "vending-machine"), scale: 1.15 }] },
  { key: "arcade", rots: [0], parts: [{ model: M("arcade", "arcade-machine"), scale: 1.15 }] },
  { key: "claw", rots: [0], parts: [{ model: M("arcade", "claw-machine"), scale: 0.9 }] },

  // ---------------- kitchen ----------------
  { key: "fridge", rots: [0], parts: [{ model: M("furniture", "kitchenFridgeLarge"), mat: { metal: "#dfe4ea", metalDark: "#9aa3ad", wood: "#eef0f3" } }] },
  {
    key: "coffee_station", rots: [0], parts: [
      { model: M("furniture", "kitchenCabinet"), mat: WHITE_KITCHEN },
      { model: M("furniture", "kitchenCoffeeMachine"), pos: [0.08, 0.45, -0.38], scale: 1.45, mat: { metalMedium: "#2a2e35", metal: "#a3a9b2" } },
      { model: M("food", "cup-coffee"), pos: [0.36, 0.45, -0.15], scale: 0.3 }
    ]
  },
  { key: "counter_microwave", rots: [0], parts: [{ model: M("furniture", "kitchenCabinet"), mat: WHITE_KITCHEN }, { model: M("furniture", "kitchenMicrowave"), pos: [0.07, 0.45, -0.3], mat: { metal: "#e9edf2", metalDark: "#2a2e35" } }] },
  { key: "counter_sink", rots: [0], parts: [{ model: M("furniture", "kitchenSink"), mat: WHITE_KITCHEN }] },
  { key: "counter", rots: [0], parts: [{ model: M("furniture", "kitchenCabinetDrawer"), mat: WHITE_KITCHEN }, { model: M("furniture", "toaster"), pos: [0.22, 0.45, -0.2], scale: 1.2 }] },
  { key: "break_table", rots: [0], parts: [{ model: M("furniture", "tableRound"), mat: { wood: "#eef0f3", metal: "#4d5562" } }] },

  // ---------------- lounges / meeting ----------------
  { key: "sofa_lobby", rots: [0, 180], parts: [{ model: M("furniture", "loungeDesignSofa"), mat: NAVY }] },
  { key: "armchair_lobby", rots: [90, 270], parts: [{ model: M("furniture", "loungeDesignChair"), mat: NAVY }] },
  { key: "sofa_break", rots: [0, 180], parts: [{ model: M("furniture", "loungeSofa"), mat: ORANGE_SOFA }] },
  { key: "sofa_exec", rots: [90], parts: [{ model: M("furniture", "loungeSofa"), mat: { carpet: "#4a2a22", wood: "#2a1f19" } }] },
  { key: "coffee_table", rots: [0], parts: [{ model: M("furniture", "tableCoffeeGlass") }] },
  { key: "conf_table", rots: [0], parts: [{ model: M("furniture", "table"), mat: WALNUT, scale: [2.6, 1.1, 2.2] }] },
  { key: "rug_exec", rots: [0], opts: { shadow: false }, parts: [{ model: M("furniture", "rugRectangle"), mat: { carpet: "#6e1f2b", carpetDarker: "#4f1520" }, scale: 1.3 }] },
  { key: "rug_lobby", rots: [0], opts: { shadow: false }, parts: [{ model: M("furniture", "rugRounded"), mat: { carpet: "#1f3a5f", carpetDarker: "#16294a" }, scale: 1.6 }] },
  { key: "rug_round", rots: [0], opts: { shadow: false }, parts: [{ model: M("furniture", "rugRound"), mat: { carpet: "#2a7a72", carpetDarker: "#1f5e58" }, scale: 1.4 }] },

  // ---------------- restroom ----------------
  { key: "toilet", rots: [180], parts: [{ model: M("furniture", "toilet") }] },
  { key: "sink", rots: [0], parts: [{ model: M("furniture", "bathroomSink") }] },

  // ---------------- props / drops ----------------
  { key: "box", rots: [0], parts: [{ model: M("furniture", "cardboardBoxClosed"), mat: CARDBOARD }] },
  {
    key: "barricade", rots: [0], parts: [
      { model: M("furniture", "cardboardBoxClosed"), mat: CARDBOARD, pos: [0, 0, 0], scale: 1.3 },
      { model: M("furniture", "cardboardBoxClosed"), mat: CARDBOARD, pos: [0.29, 0, 0.02], rotY: 8, scale: 1.3 },
      { model: M("furniture", "cardboardBoxClosed"), mat: CARDBOARD, pos: [0.58, 0, -0.01], rotY: -6, scale: 1.3 },
      { model: M("furniture", "cardboardBoxClosed"), mat: CARDBOARD, pos: [0.14, 0.36, -0.01], rotY: 5, scale: 1.3 },
      { model: M("furniture", "cardboardBoxClosed"), mat: CARDBOARD, pos: [0.44, 0.36, 0.0], rotY: -10, scale: 1.3 },
      { model: M("furniture", "chairDesk"), mat: MESH_BLACK, pos: [0.22, 0.72, -0.05], rotY: 35, scale: 0.9 }
    ]
  },
  {
    key: "belongings", rots: [0], parts: [
      { model: M("furniture", "cardboardBoxOpen"), mat: CARDBOARD, scale: 0.8 },
      { model: M("furniture", "plantSmall2"), mat: PLANT, pos: [0.04, 0.12, -0.1], scale: 1.2 },
      { model: M("food", "mug"), pos: [0.16, 0.1, -0.08], scale: 0.22 },
      { prim: "box", size: [0.09, 0.07, 0.01], color: "#d9b25f", pos: [0.1, 0.16, -0.14] }
    ]
  },
  { key: "pickup_donut", scale: 1.1, rots: [0], parts: [{ model: M("food", "donut-sprinkles"), scale: 1.3 }] },
  { key: "pickup_pizza", rots: [0], parts: [{ model: M("food", "pizza"), scale: 0.55 }] },
  { key: "pickup_coffee", rots: [0], parts: [{ model: M("food", "cup-coffee"), scale: 1.4 }] },
  { key: "pickup_soda", rots: [0], parts: [{ model: M("food", "soda-can"), scale: 1.1 }] },
  { key: "pickup_candy", rots: [0], parts: [{ model: M("food", "candy-bar"), scale: 1.4 }] },
];
