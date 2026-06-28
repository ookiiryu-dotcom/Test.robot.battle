import * as THREE from "three";
import { getChunkCoord, getChunkKey, hash2D, randomFromSeed } from "./utils.js";

export class World {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.performance = config.performance ?? {};
    this.chunks = new Map();
    this.barriers = [];
    this.temporaryColliders = [];
    this.backgroundGroup = new THREE.Group();
    this.scene.add(this.backgroundGroup);

    this.createMaterials();
    this.createReusableGeometry();
  }

  createMaterials() {
    this.groundMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0x020817,
        emissive: 0x031b2a,
        emissiveIntensity: 0.5,
        roughness: 0.78,
        metalness: 0.2
      }),
      new THREE.MeshStandardMaterial({
        color: 0x030b1f,
        emissive: 0x042333,
        emissiveIntensity: 0.45,
        roughness: 0.72,
        metalness: 0.28
      })
    ];

    this.barrierMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8fbff,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.35,
      roughness: 0.18,
      metalness: 0.2,
      transparent: true,
      opacity: 0.54
    });

    this.barrierEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72
    });

    this.dataMaterial = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide
    });

    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.42
    });

    this.coverWallMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b3550,
      emissive: 0x0e7490,
      emissiveIntensity: 0.82,
      roughness: 0.36,
      metalness: 0.45,
      flatShading: true
    });

    this.coverLineMaterial = new THREE.MeshBasicMaterial({
      color: 0xb8fbff,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide
    });
  }

  createReusableGeometry() {
    this.dataPanelGeometry = new THREE.PlaneGeometry(5.5, 1.2);
    const ringSegments = this.performance.lowPower ? 36 : 60;
    this.ringGeometry = new THREE.TorusGeometry(2.3, 0.025, 8, ringSegments);
    this.coverWallGeometry = new THREE.BoxGeometry(1, 1, 1);
  }

  getWorldSetting(name, fallback) {
    const worldConfig = this.config.world ?? {};
    const lowPowerKey = `lowPower${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    if (this.performance.lowPower && worldConfig[lowPowerKey] !== undefined) {
      return worldConfig[lowPowerKey];
    }
    return worldConfig[name] ?? fallback;
  }

  getHeightAt(x, z) {
    const { heightAmplitude, heightFrequency } = this.config.world;
    return Math.sin(x * heightFrequency) * heightAmplitude + Math.cos(z * heightFrequency) * heightAmplitude;
  }

  createBarriers() {
    this.config.barriers.forEach((barrier) => {
      this.addBarrier(barrier.x, barrier.z, barrier.width, barrier.depth, barrier.height);
    });
  }

  addBarrier(x, z, width, depth, height) {
    const y = this.getHeightAt(x, z);
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, this.barrierMaterial);
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), this.barrierEdgeMaterial);
    edges.position.copy(mesh.position);
    this.scene.add(edges);

    this.barriers.push({
      x,
      y: y + height / 2,
      z,
      halfX: width / 2,
      halfY: height / 2,
      halfZ: depth / 2,
      mesh,
      edges
    });
  }

  addTemporaryCollider(collider) {
    this.temporaryColliders.push(collider);
  }

  removeTemporaryCollider(collider) {
    const index = this.temporaryColliders.indexOf(collider);
    if (index >= 0) this.temporaryColliders.splice(index, 1);
  }

  getColliders() {
    const chunkColliders = [];
    for (const group of this.chunks.values()) {
      if (group.userData.colliders) chunkColliders.push(...group.userData.colliders);
    }
    return [...this.barriers, ...this.temporaryColliders, ...chunkColliders];
  }

  createChunk(cx, cz) {
    const chunkSize = this.getWorldSetting("chunkSize", 80);
    const chunkSegments = this.getWorldSetting("chunkSegments", 28);
    const key = getChunkKey(cx, cz);
    if (this.chunks.has(key)) return;

    const group = new THREE.Group();
    group.position.set(cx * chunkSize, 0, cz * chunkSize);

    const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, chunkSegments, chunkSegments);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const localX = position.getX(i);
      const localZ = position.getZ(i);
      const worldX = localX + cx * chunkSize;
      const worldZ = localZ + cz * chunkSize;
      position.setY(i, this.getHeightAt(worldX, worldZ));
    }
    geometry.computeVertexNormals();

    const materialIndex = Math.abs(hash2D(cx, cz)) % this.groundMaterials.length;
    const ground = new THREE.Mesh(geometry, this.groundMaterials[materialIndex]);
    ground.receiveShadow = true;
    group.add(ground);

    const grid = new THREE.GridHelper(chunkSize, 16, 0x67e8f9, 0x0e7490);
    grid.position.y = 0.08;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.36;
    });
    group.add(grid);

    this.createCoverWalls(group, cx, cz);
    this.scene.add(group);
    this.chunks.set(key, group);
  }

  createCoverWalls(group, cx, cz) {
    const chunkSize = this.getWorldSetting("chunkSize", 80);
    const coverWallMinCount = this.getWorldSetting("coverWallMinCount", 6);
    const coverWallRandomCount = this.getWorldSetting("coverWallRandomCount", 6);
    const rand = randomFromSeed(hash2D(cx + 991, cz - 313));
    const wallCount = coverWallMinCount + Math.floor(rand() * coverWallRandomCount);
    group.userData.colliders = group.userData.colliders || [];

    for (let i = 0; i < wallCount; i++) {
      const localX = (rand() - 0.5) * chunkSize;
      const localZ = (rand() - 0.5) * chunkSize;
      const worldX = localX + cx * chunkSize;
      const worldZ = localZ + cz * chunkSize;
      const y = this.getHeightAt(worldX, worldZ);
      const width = 7 + rand() * 10;
      const height = 4.6 + rand() * 2.8;
      const depth = 1.6 + rand() * 0.9;
      const rotateQuarter = Math.floor(rand() * 4) * (Math.PI / 2);
      const angle = rotateQuarter;

      const wall = new THREE.Group();
      wall.position.set(localX, y, localZ);
      wall.rotation.y = angle;

      const panel = new THREE.Mesh(this.coverWallGeometry, this.coverWallMaterial);
      panel.position.y = height / 2;
      panel.scale.set(width, height, depth);
      panel.castShadow = true;
      panel.receiveShadow = true;
      wall.add(panel);

      const topRail = new THREE.Mesh(this.coverWallGeometry, this.coverLineMaterial);
      topRail.position.y = height + 0.2;
      topRail.scale.set(width * 1.05, 0.28, depth * 1.25);
      wall.add(topRail);

      const leftPost = new THREE.Mesh(this.coverWallGeometry, this.coverLineMaterial);
      leftPost.position.set(-width / 2, height / 2, 0);
      leftPost.scale.set(0.36, height * 1.08, depth * 1.3);
      wall.add(leftPost);

      const rightPost = new THREE.Mesh(this.coverWallGeometry, this.coverLineMaterial);
      rightPost.position.set(width / 2, height / 2, 0);
      rightPost.scale.set(0.36, height * 1.08, depth * 1.3);
      wall.add(rightPost);

      const centerLine = new THREE.Mesh(this.coverWallGeometry, this.coverLineMaterial);
      centerLine.position.y = height * 0.5;
      centerLine.scale.set(width * 1.04, 0.1, depth * 1.28);
      wall.add(centerLine);

      group.add(wall);

      const halfX = Math.abs(Math.cos(angle)) * width / 2 + Math.abs(Math.sin(angle)) * depth / 2;
      const halfZ = Math.abs(Math.sin(angle)) * width / 2 + Math.abs(Math.cos(angle)) * depth / 2;
      group.userData.colliders.push({
        x: worldX,
        y: y + height / 2,
        z: worldZ,
        halfX,
        halfY: height / 2 + 0.28,
        halfZ
      });
    }
  }

  updateChunks(playerPosition) {
    const chunkSize = this.getWorldSetting("chunkSize", 80);
    const viewDistance = this.getWorldSetting("viewDistance", 3);
    const pcx = getChunkCoord(playerPosition.x, chunkSize);
    const pcz = getChunkCoord(playerPosition.z, chunkSize);
    const needed = new Set();

    for (let x = pcx - viewDistance; x <= pcx + viewDistance; x++) {
      for (let z = pcz - viewDistance; z <= pcz + viewDistance; z++) {
        const key = getChunkKey(x, z);
        needed.add(key);
        this.createChunk(x, z);
      }
    }

    for (const [key, group] of this.chunks.entries()) {
      if (!needed.has(key)) {
        this.scene.remove(group);
        group.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
        });
        this.chunks.delete(key);
      }
    }

    return { cx: pcx, cz: pcz };
  }

  createBackground() {
    const backgroundCount = this.getWorldSetting("backgroundCount", 70);
    for (let i = 0; i < backgroundCount; i++) {
      const node = new THREE.Group();
      const seed = randomFromSeed(i * 999 + 12);

      if (seed() > 0.45) {
        const panel = new THREE.Mesh(this.dataPanelGeometry, this.dataMaterial);
        panel.scale.x = 0.5 + seed() * 1.8;
        node.add(panel);
      } else {
        const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.scale.setScalar(0.45 + seed() * 1.3);
        node.add(ring);
      }

      node.position.set((seed() - 0.5) * 420, 18 + seed() * 58, (seed() - 0.5) * 420);
      node.rotation.set(seed() * Math.PI, seed() * Math.PI, seed() * Math.PI);
      this.backgroundGroup.add(node);
    }
  }

  updateBackground(playerPosition) {
    this.backgroundGroup.position.x = playerPosition.x * 0.25;
    this.backgroundGroup.position.z = playerPosition.z * 0.25;
  }

  getChunkInfo(playerPosition) {
    return {
      cx: getChunkCoord(playerPosition.x, this.config.world.chunkSize),
      cz: getChunkCoord(playerPosition.z, this.config.world.chunkSize),
      chunkCount: this.chunks.size
    };
  }
}
