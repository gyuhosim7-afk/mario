import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('../assets/characters/bbiyak/bbiyak-pilot.glb');
const scene = new THREE.Scene();
const root = new THREE.Group();
root.name = 'Bbiyak_Pilot_Rig';
scene.add(root);

const mats = {
  feather: new THREE.MeshPhysicalMaterial({ color: 0xf7d94a, roughness: 0.48, sheen: 0.8, sheenRoughness: 0.42 }),
  belly: new THREE.MeshPhysicalMaterial({ color: 0xfff3c4, roughness: 0.56, sheen: 0.7 }),
  orange: new THREE.MeshPhysicalMaterial({ color: 0xffa726, roughness: 0.3, clearcoat: 0.35 }),
  trim: new THREE.MeshPhysicalMaterial({ color: 0xf26d3d, roughness: 0.34, clearcoat: 0.42 }),
  cap: new THREE.MeshPhysicalMaterial({ color: 0x263c70, roughness: 0.28, clearcoat: 0.55, clearcoatRoughness: 0.16 }),
  goggle: new THREE.MeshPhysicalMaterial({ color: 0x182231, roughness: 0.2, metalness: 0.72, clearcoat: 0.7 }),
  lens: new THREE.MeshPhysicalMaterial({ color: 0x45d9d3, roughness: 0.08, metalness: 0.15, transmission: 0.1, emissive: 0x0b5b68, emissiveIntensity: 0.35, clearcoat: 1 }),
  harness: new THREE.MeshStandardMaterial({ color: 0x243452, roughness: 0.42, metalness: 0.22 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xf8f8fb, roughness: 0.3, clearcoat: 0.2 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.34, metalness: 0.25 })
};

function add(mesh, parent = root, name = '') { mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }
function sphere(name, r, mat, p, scale = [1, 1, 1], parent = root) { const m = add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat), parent, name); m.position.set(...p); m.scale.set(...scale); return m; }
function capsule(name, r, len, mat, p, scale = [1, 1, 1], parent = root) { const m = add(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 24), mat), parent, name); m.position.set(...p); m.scale.set(...scale); return m; }
function box(name, size, mat, p, rot = [0, 0, 0], parent = root) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(...size), mat), parent, name); m.position.set(...p); m.rotation.set(...rot); return m; }
function cone(name, r, h, mat, p, rot = [0, 0, 0], parent = root) { const m = add(new THREE.Mesh(new THREE.ConeGeometry(r, h, 24), mat), parent, name); m.position.set(...p); m.rotation.set(...rot); return m; }
function torus(name, r, tube, mat, p, rot = [0, 0, 0], parent = root) { const m = add(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 16, 36), mat), parent, name); m.position.set(...p); m.rotation.set(...rot); return m; }
function limb(name, a, b, r, mat, parent = root) { const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va); const m = capsule(name, r, Math.max(0.2, d.length() - r * 2), mat, [0, 0, 0], [1, 1, 1], parent); m.position.copy(va).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m; }

const body = sphere('Body', 4.3, mats.feather, [0, 8.2, 0], [1, 1.05, 0.9]);
sphere('Belly_Patch', 3.35, mats.belly, [3.55, 7.35, 0], [0.42, 1.18, 0.9]);
const head = sphere('Head', 5.4, mats.feather, [0.15, 16.7, 0], [1.05, 1.0, 1.02]);
sphere('Cheek_L', 1.7, mats.belly, [4.25, 15.4, -2.1], [0.55, 0.8, 0.75]);
sphere('Cheek_R', 1.7, mats.belly, [4.25, 15.4, 2.1], [0.55, 0.8, 0.75]);
cone('Beak', 2.1, 4.2, mats.orange, [5.4, 15.3, 0], [0, 0, -Math.PI / 2]);

sphere('Pilot_Cap', 5.2, mats.cap, [-0.25, 20.35, 0], [1.03, 0.56, 1.0]);
box('Cap_Peak', [4.3, 1.0, 2.7], mats.cap, [3.0, 19.55, 0], [0, 0, 0.02]);
for (const side of [-1, 1]) {
  torus(`Goggle_Frame_${side}`, 2.15, 0.34, mats.goggle, [5.0, 16.95, side * 2.05], [0, Math.PI / 2, 0]);
  sphere(`Goggle_Lens_${side}`, 1.82, mats.lens, [5.08, 16.95, side * 2.05], [0.22, 0.88, 1]);
  sphere(`Lens_Highlight_${side}`, 0.34, mats.white, [5.55, 17.55, side * 2.35], [0.16, 0.46, 0.22]);
}
box('Goggle_Bridge', [1.15, 0.48, 4.2], mats.goggle, [5.0, 16.95, 0]);
torus('Goggle_Strap', 5.15, 0.24, mats.goggle, [0, 16.95, 0], [Math.PI / 2, 0, 0], head);

// torso harness and pilot controls
limb('Harness_L', [-2.6, 11.2, -2.4], [2.3, 7.4, -2.4], 0.38, mats.harness);
limb('Harness_R', [-2.6, 11.2, 2.4], [2.3, 7.4, 2.4], 0.38, mats.harness);
sphere('Button_L', 0.5, mats.trim, [3.75, 9.2, -0.9]);
sphere('Button_R', 0.5, mats.trim, [3.75, 9.2, 0.9]);

// wings with layered feathers
for (const side of [-1, 1]) {
  sphere(`Wing_Base_${side}`, 3.0, mats.orange, [-1.0, 8.4, side * 4.0], [0.9, 1.2, 0.36]);
  for (let i = 0; i < 3; i++) {
    const feather = cone(`Wing_Feather_${side}_${i}`, 1.2 - i * 0.15, 3.8 - i * 0.3, mats.orange, [-2.1 - i * 0.35, 9.1 - i * 0.6, side * (4.8 + i * 0.18)], [0, side * 0.1, side * (1.4 - i * 0.08)]);
    feather.rotation.x = -0.12 * side;
  }
}

// scarf and tail are named nodes for runtime secondary motion
const scarf = new THREE.Group(); scarf.name = 'Scarf'; scarf.position.set(-2.1, 13.9, 1.4); root.add(scarf);
torus('Scarf_Collar', 3.1, 1.15, mats.trim, [0, 0, 0], [Math.PI / 2, 0, 0], scarf);
limb('Scarf_Tail', [0, 0, 0], [-6.2, 3.1, 3.0], 0.8, mats.trim, scarf);
const tail = new THREE.Group(); tail.name = 'Tail'; tail.position.set(-4.0, 8.7, 0); root.add(tail);
for (const i of [-1, 0, 1]) cone(`Tail_Feather_${i}`, 1.4, 4.8, mats.orange, [0, i * 1.3, i * 2.0], [0.0, 0.2, 1.9], tail);

// seated legs, gloves, and boots
for (const side of [-1, 1]) {
  limb(`Thigh_${side}`, [0.6, 3.9, side * 3.0], [5.0, 3.7, side * 3.0], 1.8, mats.feather);
  limb(`Shin_${side}`, [5.0, 3.7, side * 3.0], [5.3, 0.9, side * 3.0], 1.45, mats.feather);
  sphere(`Boot_${side}`, 2.15, mats.trim, [6.0, 0.5, side * 3.0], [1.1, 0.8, 1.55]);
  limb(`Arm_${side}`, [2.0, 12.2, side * 3.5], [4.1, 8.8, side * 3.5], 1.15, mats.feather);
  sphere(`Glove_${side}`, 1.3, mats.white, [4.3, 8.2, side * 3.5], [1.0, 0.85, 1.0]);
}

root.userData.characterId = 'bbiyak';
root.userData.displayName = '삐약';
root.userData.version = 'pilot-v1';
root.scale.setScalar(0.72);

// GLTFExporter uses FileReader for binary buffer conversion in the browser.
// This tiny shim keeps the generator dependency-free in Node 22.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const exporter = new GLTFExporter();
exporter.parse(scene, (result) => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(result));
  console.log(`Wrote ${out} (${Buffer.byteLength(result)} bytes)`);
}, (error) => { console.error(error); process.exitCode = 1; }, { binary: true, onlyVisible: true });
