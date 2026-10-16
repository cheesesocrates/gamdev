// Renders Kenney 3D models into top-down sprites for the game.
// Driven by tools/render-assets.mjs through puppeteer; every function the
// script needs is exposed on window.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const cache = new Map();

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

async function loadModel(path) {
  if (cache.has(path)) return cache.get(path);
  const gltf = await loader.loadAsync(path);
  cache.set(path, gltf.scene);
  return gltf.scene;
}

function cloneWithTint(src, tint) {
  const obj = src.clone(true);
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const next = mats.map((m) => {
        const c = m.clone();
        if (tint) {
          if (tint.color !== undefined && c.color) c.color.multiply(new THREE.Color(tint.color));
          if (tint.replace !== undefined && c.color) c.color.set(tint.replace);
          if (tint.emissive !== undefined) { c.emissive = new THREE.Color(tint.emissive); c.emissiveIntensity = tint.emissiveIntensity ?? 0.6; }
          if (tint.opacity !== undefined) { c.transparent = true; c.opacity = tint.opacity; }
        }
        return c;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    }
  });
  return obj;
}

function makePrimitive(part) {
  const [w, h, d] = part.size;
  let geo;
  if (part.prim === "box") geo = new THREE.BoxGeometry(w, h, d);
  else if (part.prim === "cyl") geo = new THREE.CylinderGeometry(part.rTop ?? w / 2, part.rBottom ?? w / 2, h, part.segments ?? 24);
  else if (part.prim === "sphere") geo = new THREE.SphereGeometry(w / 2, 20, 14);
  const mat = new THREE.MeshStandardMaterial({
    color: part.color ?? "#cccccc",
    roughness: part.roughness ?? 0.7,
    metalness: part.metalness ?? 0.05,
    transparent: part.opacity !== undefined,
    opacity: part.opacity ?? 1,
    emissive: part.emissive ?? "#000000",
    emissiveIntensity: part.emissive ? 0.8 : 0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Primitives are positioned by their bottom-centre.
  const inner = new THREE.Group();
  mesh.position.y = part.prim === "sphere" ? w / 2 : h / 2;
  inner.add(mesh);
  return inner;
}

async function buildGroup(spec) {
  const group = new THREE.Group();
  for (const part of spec.parts) {
    let obj;
    if (part.prim) {
      obj = makePrimitive(part);
    } else {
      const src = await loadModel(part.model);
      obj = cloneWithTint(src, part.tint);
      if (part.mat) {
        obj.traverse((o) => {
          if (!o.isMesh) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) if (part.mat[m.name] && m.color) m.color.set(part.mat[m.name]);
        });
      }
    }
    const [px, py, pz] = part.pos ?? [0, 0, 0];
    obj.position.set(px, py, pz);
    obj.rotation.set(
      THREE.MathUtils.degToRad(part.rotX ?? 0),
      THREE.MathUtils.degToRad(part.rotY ?? 0),
      THREE.MathUtils.degToRad(part.rotZ ?? 0)
    );
    const s = part.scale ?? 1;
    if (Array.isArray(s)) obj.scale.set(s[0], s[1], s[2]);
    else obj.scale.setScalar(s);
    group.add(obj);
  }
  return group;
}

window.listMaterials = async (paths) => {
  const out = {};
  for (const p of paths) {
    const m = await loadModel(p);
    const names = {};
    m.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) names[mat.name || "(unnamed)"] = "#" + (mat.color ? mat.color.getHexString() : "------") + (mat.map ? " (tex)" : "");
    });
    out[p] = names;
  }
  return out;
};

window.measure = async (paths) => {
  const out = {};
  for (const p of paths) {
    const m = await loadModel(p);
    const box = new THREE.Box3().setFromObject(m);
    out[p] = { min: box.min.toArray().map((v) => +v.toFixed(3)), max: box.max.toArray().map((v) => +v.toFixed(3)) };
  }
  return out;
};

/**
 * spec: { key, parts:[{model,pos,rotY,scale,tint}], rotY }
 * opts: { ppu, pitchDeg, ss, outline, shadow }
 */
window.renderItem = async (spec, opts) => {
  const ppu = opts.ppu;
  const ss = opts.ss ?? 3;
  const pitch = THREE.MathUtils.degToRad(opts.pitchDeg ?? 0);

  const inner = await buildGroup(spec);
  const holder = new THREE.Group();
  holder.add(inner);
  holder.rotation.y = THREE.MathUtils.degToRad(spec.rotY ?? 0);
  holder.scale.setScalar(spec.scale ?? 1);
  holder.updateMatrixWorld(true);

  // Re-center the footprint on the origin so the sprite anchor is the
  // centre of the object's ground rectangle.
  const box0 = new THREE.Box3().setFromObject(holder);
  const cx = (box0.min.x + box0.max.x) / 2;
  const cz = (box0.min.z + box0.max.z) / 2;
  holder.position.set(-cx, -box0.min.y, -cz);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);

  const scene = new THREE.Scene();
  scene.add(holder);

  scene.add(new THREE.HemisphereLight(0xf4f1ff, 0x5a5560, 1.25));
  const key = new THREE.DirectionalLight(0xfff2dd, 2.1);
  key.position.set(-1.4, 8, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const ext = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, box.max.y) * 1.5 + 1;
  key.shadow.camera.left = -ext; key.shadow.camera.right = ext;
  key.shadow.camera.top = ext; key.shadow.camera.bottom = -ext;
  key.shadow.camera.near = 0.1; key.shadow.camera.far = 30;
  key.shadow.bias = -0.0008;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.55);
  fill.position.set(3, 4, -2);
  scene.add(fill);

  if (opts.shadow !== false) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(ext * 4, ext * 4), new THREE.ShadowMaterial({ opacity: opts.shadowOpacity ?? 0.32 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.0005;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // Camera sits to the "south" (+Z) and above, looking down at the origin.
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const R = 20;
  cam.position.set(0, Math.cos(pitch) * R, Math.sin(pitch) * R);
  cam.up.set(0, 0, -1);
  if (pitch > 0.0001) cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);

  // Project the bounding box (plus a shadow margin on the ground) into
  // camera space to find the tight frame.
  const pts = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
  if (opts.shadow !== false) {
    // Where the top corners' shadows land on the ground, plus a blur margin.
    const L = key.position;
    const blur = 0.05;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
      const t = box.max.y / L.y;
      const sx = x - L.x * t, sz = z - L.z * t;
      for (const ox of [-blur, blur]) for (const oz of [-blur, blur]) pts.push(new THREE.Vector3(sx + ox, 0, sz + oz));
    }
  }
  const inv = cam.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    const v = p.clone().applyMatrix4(inv);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const pad = 2 / ppu;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  cam.left = minX; cam.right = maxX; cam.top = maxY; cam.bottom = minY;
  cam.updateProjectionMatrix();

  const w = Math.max(1, Math.ceil((maxX - minX) * ppu));
  const h = Math.max(1, Math.ceil((maxY - minY) * ppu));
  renderer.setSize(w * ss, h * ss, false);
  renderer.render(scene, cam);

  // Downsample (supersampling AA) into a 2D canvas.
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (opts.filter) ctx.filter = opts.filter;
  ctx.drawImage(renderer.domElement, 0, 0, w * ss, h * ss, 0, 0, w, h);
  ctx.filter = "none";

  if (opts.outline) {
    // Soft dark outline: stamp the silhouette around itself, then draw the
    // sprite back on top. Matches the outlined Kenney 2D characters.
    const sil = document.createElement("canvas");
    sil.width = w; sil.height = h;
    const sctx = sil.getContext("2d");
    sctx.drawImage(out, 0, 0);
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = opts.outline;
    sctx.fillRect(0, 0, w, h);
    const fin = document.createElement("canvas");
    fin.width = w; fin.height = h;
    const fctx = fin.getContext("2d");
    const r = opts.outlineWidth ?? 1.5;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      fctx.drawImage(sil, Math.cos(ang) * r, Math.sin(ang) * r);
    }
    fctx.drawImage(out, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(fin, 0, 0);
  }

  // Anchor = where the ground footprint centre lands in the sprite.
  const o = new THREE.Vector3(0, 0, 0).applyMatrix4(inv);
  const anchorX = (o.x - minX) / (maxX - minX);
  const anchorY = 1 - (o.y - minY) / (maxY - minY);

  // Footprint (world units) after rotation.
  const fw = box.max.x - box.min.x;
  const fd = box.max.z - box.min.z;

  // Free the per-render material clones (geometry stays cached).
  scene.traverse((o2) => {
    if (o2.isMesh) {
      const mats = Array.isArray(o2.material) ? o2.material : [o2.material];
      mats.forEach((m) => m.dispose?.());
    }
  });

  return { dataUrl: out.toDataURL("image/png"), w, h, anchorX, anchorY, footW: fw, footD: fd, height: box.max.y };
};

window.ready = true;
