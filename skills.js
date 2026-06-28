import * as THREE from "three";

export class SkillController {
  constructor(scene, config, world) {
    this.scene = scene;
    this.config = config.skills;
    this.world = world;
    this.projectiles = [];
    this.slashes = [];
    this.shields = [];
    this.thrownMines = [];
    this.mines = [];
    this.explosions = [];
    this.rocketVolleys = [];
    this.heldShield = null;
    this.shieldCooldownTimer = 0;

    this.projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4a3 });
    this.slashGeometry = new THREE.TorusGeometry(0.88, 0.045, 6, 34, Math.PI * 1.35);
    this.slashMaterial = new THREE.MeshBasicMaterial({
      color: 0x9ff8ff,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide
    });
    this.shieldMaterial = new THREE.MeshBasicMaterial({
      color: 0x7df9ff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide
    });
    this.mineMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    this.explosionMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8c42,
      transparent: true,
      opacity: 0.72,
      wireframe: true
    });
  }

  trigger(action, player, yaw) {
    if (action === "shoot") this.shootFrom(player, yaw, "player", 0xfff4a3);
    if (action === "shield") this.placeShield(player, yaw);
    if (action === "ascend") player.activateAscend(this.config.ascendDuration, this.config.ascendSpeed);
    if (action === "mine") this.placeMine(player, yaw, "player");
  }

  getForward(yaw) {
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  }

  shootFrom(actor, yaw, team, color = 0xfff4a3, options = {}) {
    const direction = this.getForward(yaw);
    const originHeight = options.originHeight ?? this.config.projectileOriginHeight ?? 1.55;
    const material = this.projectileMaterial.clone();
    material.color.setHex(color);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.config.projectileRadius, 12, 8), material);
    mesh.position.copy(actor.position);
    // 弾の発射位置を設定値で少し高めにして、画面の十字照準と弾道を合わせやすくする。
    mesh.position.y += originHeight;
    mesh.position.addScaledVector(direction, 1.1);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      previousPosition: mesh.position.clone(),
      direction,
      team,
      owner: options.owner ?? actor,
      damage: options.damage ?? this.config.projectileDamage,
      speed: options.speed ?? this.config.projectileSpeed,
      life: options.lifetime ?? this.config.projectileLifetime
    });
  }

  shootAt(actor, aimPoint, team = "player", color = 0xfff4a3, options = {}) {
    const origin = actor.position.clone();
    // 十字照準へ向けて撃つ時の発射位置。低すぎると照準より下から飛んで見える。
    origin.y += options.originHeight ?? this.config.projectileOriginHeight ?? 1.55;
    const direction = aimPoint.clone().sub(origin);
    if (direction.lengthSq() === 0) return;

    if (team === "player" && direction.y < 0) {
      this.adjustPlayerAimDirection(direction, options);
    }

    direction.normalize();

    const material = this.projectileMaterial.clone();
    material.color.setHex(color);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.config.projectileRadius, 12, 8), material);
    mesh.position.copy(origin).addScaledVector(direction, 1.1);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      previousPosition: mesh.position.clone(),
      direction,
      team,
      owner: options.owner ?? actor,
      damage: options.damage ?? this.config.projectileDamage,
      speed: options.speed ?? this.config.projectileSpeed,
      life: options.lifetime ?? this.config.projectileLifetime
    });
  }

  adjustPlayerAimDirection(direction, options = {}) {
    // 三人称カメラは少し上から見るため、照準Rayが地面寄りになりやすい。
    // プレイヤーの攻撃だけ、軽い下向きは浅くしつつ、本当に下を向いた時はそのまま下へ撃てるようにする。
    if (direction.y >= 0) return direction;

    const rawY = direction.y;
    const downAimScale = options.downAimScale ?? this.config.projectileDownAimScale ?? 0.16;
    const minVerticalAim = options.minVerticalAim ?? this.config.projectileMinVerticalAim ?? -0.025;
    const shallowY = Math.max(rawY * downAimScale, minVerticalAim);
    const pitch = options.pitch ?? 0;
    const softClampPitch = this.config.projectileDownAimSoftClampPitch ?? -0.32;
    const freePitch = this.config.projectileDownAimFreePitch ?? -0.82;
    const freeDownAmount = THREE.MathUtils.clamp((softClampPitch - pitch) / (softClampPitch - freePitch), 0, 1);
    direction.y = THREE.MathUtils.lerp(shallowY, rawY, freeDownAmount);
    return direction;
  }

  aimDirectionFromActor(actor, target, options = {}) {
    const origin = actor.position.clone();
    origin.y += options.originHeight ?? this.config.slashOriginHeight ?? 1.55;
    const aimPoint = target.position ? target.position.clone() : target.clone();
    if (target.position) aimPoint.y += options.targetHeight ?? this.config.slashTargetHeight ?? 1.2;
    const direction = aimPoint.sub(origin);
    if (options.team === "player" && options.playerAimCorrection !== false) {
      this.adjustPlayerAimDirection(direction, options);
    } else if (options.verticalAimScale !== undefined) {
      direction.y *= options.verticalAimScale;
    }
    if (direction.lengthSq() === 0) return null;
    direction.normalize();
    return { origin, direction };
  }

  orientMeshToDirection(mesh, direction) {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  }

  createProjectileMesh(color, options = {}) {
    const material = this.projectileMaterial.clone();
    material.color.setHex(color);
    material.transparent = options.opacity !== undefined;
    if (options.opacity !== undefined) material.opacity = options.opacity;

    if (options.shape === "bolt") {
      return new THREE.Mesh(
        new THREE.BoxGeometry(options.width ?? 0.18, options.height ?? 0.18, options.length ?? 1.25),
        material
      );
    }

    if (options.shape === "cross") {
      const group = new THREE.Group();
      const geometry = new THREE.BoxGeometry(options.length ?? 1.45, options.width ?? 0.16, options.depth ?? 0.2);
      const barA = new THREE.Mesh(geometry, material);
      const barB = new THREE.Mesh(geometry, material.clone());
      barB.userData.disposeGeometry = false;
      barA.rotation.z = Math.PI / 4;
      barB.rotation.z = -Math.PI / 4;
      group.add(barA, barB);
      return group;
    }

    return new THREE.Mesh(
      new THREE.SphereGeometry(options.radius ?? this.config.projectileRadius, 12, 8),
      material
    );
  }

  projectileAt(actor, target, team = "enemy", color = 0xff3b30, options = {}) {
    const aim = this.aimDirectionFromActor(actor, target, { ...options, team });
    if (!aim) return null;

    const mesh = this.createProjectileMesh(color, options);
    mesh.position.copy(aim.origin).addScaledVector(aim.direction, options.startOffset ?? 1.25);
    this.orientMeshToDirection(mesh, aim.direction);
    this.scene.add(mesh);

    const projectile = {
      mesh,
      previousPosition: mesh.position.clone(),
      direction: aim.direction,
      team,
      owner: options.owner ?? actor,
      damage: options.damage ?? this.config.projectileDamage,
      speed: options.speed ?? this.config.projectileSpeed,
      life: options.lifetime ?? this.config.projectileLifetime,
      hitRadius: options.hitRadius ?? this.config.projectileRadius,
      explosionRadius: options.explosionRadius ?? 0,
      explosionDamage: options.explosionDamage ?? options.damage ?? this.config.projectileDamage
    };
    this.projectiles.push(projectile);
    return projectile;
  }

  crossShotAt(actor, target, options = {}) {
    return this.projectileAt(actor, target, options.team ?? "enemy", options.color ?? 0xe0f7ff, {
      shape: "cross",
      width: options.width ?? 0.14,
      height: options.height ?? 0.14,
      length: options.length ?? 1.55,
      owner: options.owner,
      originHeight: options.originHeight ?? 1.65,
      targetHeight: options.targetHeight ?? 1.35,
      verticalAimScale: options.verticalAimScale ?? 0.42,
      playerAimCorrection: options.playerAimCorrection,
      pitch: options.pitch,
      damage: options.damage ?? 16,
      speed: options.speed ?? 36,
      lifetime: options.lifetime ?? 2.5,
      hitRadius: options.hitRadius ?? 0.62
    });
  }

  beamFrom(actor, target, options = {}, callbacks = {}) {
    const maxDistance = options.range ?? 72;
    const aim = this.aimDirectionFromActor(actor, target, {
      team: options.team ?? "enemy",
      pitch: options.pitch,
      originHeight: options.originHeight ?? 1.7,
      targetHeight: options.targetHeight ?? 1.35,
      verticalAimScale: options.verticalAimScale ?? 0.18
    });
    if (!aim) return;

    const end = aim.origin.clone().addScaledVector(aim.direction, maxDistance);
    const length = aim.origin.distanceTo(end);
    const material = new THREE.MeshBasicMaterial({
      color: options.color ?? 0x9ff8ff,
      transparent: true,
      opacity: options.opacity ?? 0.62
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(options.width ?? 0.48, options.width ?? 0.48, length), material);
    mesh.position.copy(aim.origin).addScaledVector(aim.direction, length / 2);
    this.orientMeshToDirection(mesh, aim.direction);
    this.scene.add(mesh);
    const duration = options.duration ?? 2;
    const tickInterval = options.tickInterval ?? 0.25;
    this.explosions.push({
      mesh,
      life: duration,
      maxLife: duration,
      isBeam: true,
      start: aim.origin.clone(),
      end,
      team: options.team ?? "enemy",
      owner: options.owner ?? actor,
      damagePerTick: (options.damage ?? 34) * tickInterval / Math.max(duration, tickInterval),
      tickInterval,
      tickTimer: 0,
      hitRadius: options.hitRadius ?? 1.0,
      verticalPadding: options.verticalPadding ?? 0.65,
      baseOpacity: options.opacity ?? 0.62
    });
  }

  applyBeamDamage(beam, player, enemies, callbacks = {}) {
    const targets = this.getAttackTargets(beam, player, enemies);

    for (const hitTarget of targets) {
      if (!this.segmentHitsBody(
        beam.start,
        beam.end,
        hitTarget,
        (hitTarget.radius ?? 0.68) + beam.hitRadius,
        beam.verticalPadding
      )) {
        continue;
      }

      const damage = Math.max(1, Math.round(beam.damagePerTick));
      if (hitTarget.takeDamage(damage, { team: beam.team, type: "beam" })) {
        if (hitTarget === player) callbacks.onPlayerDeath?.(beam);
        else callbacks.onEnemyDeath?.(hitTarget, beam);
      }
    }
  }

  slashFrom(actor, target, options = {}) {
    const origin = actor.position.clone();
    origin.y += options.originHeight ?? this.config.slashOriginHeight ?? 1.55;
    const aimPoint = target.position ? target.position.clone() : target.clone();
    if (target.position) aimPoint.y += options.targetHeight ?? this.config.slashTargetHeight ?? 1.2;
    const direction = aimPoint.sub(origin);
    if ((options.team ?? "enemy") === "player" && options.playerAimCorrection !== false) {
      this.adjustPlayerAimDirection(direction, options);
    } else {
      direction.y *= options.verticalAimScale ?? 0.18;
    }
    if (direction.lengthSq() === 0) return;
    direction.normalize();

    const yaw = Math.atan2(direction.x, direction.z);
    const material = this.slashMaterial.clone();
    if (options.color !== undefined) material.color.setHex(options.color);
    if (options.opacity !== undefined) material.opacity = options.opacity;
    const mesh = new THREE.Mesh(this.slashGeometry, material);
    mesh.userData.disposeGeometry = false;
    mesh.position.copy(origin).addScaledVector(direction, 1.3);
    mesh.rotation.y = yaw;
    mesh.rotation.z = -0.55;
    const visualScale = options.visualScale ?? 1.2;
    mesh.scale.set(visualScale, visualScale, visualScale);
    this.scene.add(mesh);

    this.slashes.push({
      mesh,
      previousPosition: mesh.position.clone(),
      direction,
      team: options.team ?? "enemy",
      owner: options.owner ?? actor,
      damage: options.damage ?? this.config.slashDamage,
      speed: options.speed ?? this.config.slashSpeed,
      life: options.lifetime ?? this.config.slashLifetime,
      traveled: 0,
      maxDistance: options.maxDistance ?? this.config.slashMaxDistance,
      hitRadius: options.hitRadius ?? this.config.slashHitRadius
    });
  }

  placeShield(player, yaw) {
    // Shield is a placed wall now: one tap creates it, then cooldown prevents spam.
    if (this.shieldCooldownTimer > 0) return false;

    const direction = this.getForward(yaw);
    const center = player.position.clone().addScaledVector(direction, this.config.shieldDistance);
    center.y = this.world.getHeightAt(center.x, center.z) + this.config.shieldHeight / 2;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.config.shieldWidth, this.config.shieldHeight, 0.28),
      this.shieldMaterial.clone()
    );
    mesh.position.copy(center);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);

    const collider = {
      x: center.x,
      y: center.y,
      z: center.z,
      halfX: Math.abs(Math.cos(yaw)) * this.config.shieldWidth / 2 + Math.abs(Math.sin(yaw)) * 0.14,
      halfY: this.config.shieldHeight / 2,
      halfZ: Math.abs(Math.sin(yaw)) * this.config.shieldWidth / 2 + Math.abs(Math.cos(yaw)) * 0.14,
      blocksTeams: ["enemy", "bot"]
    };
    this.world.addTemporaryCollider(collider);

    this.shields.push({
      mesh,
      collider,
      life: this.config.shieldDuration
    });
    this.shieldCooldownTimer = this.config.shieldCooldown ?? 5;
    return true;
  }

  createHeldShield() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.config.shieldWidth * 0.72, this.config.shieldHeight * 0.72, 0.22),
      this.shieldMaterial.clone()
    );
    mesh.material.opacity = 0.5;
    this.scene.add(mesh);

    const collider = {
      x: 0,
      y: 0,
      z: 0,
      halfX: 0,
      halfY: this.config.shieldHeight * 0.36,
      halfZ: 0,
      blocksTeams: ["enemy", "bot"],
      onBlock: null
    };
    this.world.addTemporaryCollider(collider);
    this.heldShield = { mesh, collider };
  }

  removeHeldShield() {
    if (!this.heldShield) return;
    this.world.removeTemporaryCollider(this.heldShield.collider);
    this.scene.remove(this.heldShield.mesh);
    this.heldShield.mesh.geometry.dispose();
    this.heldShield.mesh.material.dispose();
    this.heldShield = null;
  }

  updateHeldShield(player, yaw, active) {
    if (!active) {
      this.removeHeldShield();
      return;
    }

    if (!this.heldShield) {
      this.createHeldShield();
    }

    const direction = this.getForward(yaw);
    const center = player.position.clone().addScaledVector(direction, this.config.shieldDistance * 0.78);
    const width = this.config.shieldWidth * 0.72;
    const depth = 0.22;
    center.y = player.position.y + this.config.shieldHeight * 0.32;

    this.heldShield.mesh.position.copy(center);
    this.heldShield.mesh.rotation.y = yaw;
    this.heldShield.mesh.material.opacity = 0.42 + Math.sin(performance.now() * 0.012) * 0.08;
    this.heldShield.collider.x = center.x;
    this.heldShield.collider.y = center.y;
    this.heldShield.collider.z = center.z;
    this.heldShield.collider.halfX = Math.abs(Math.cos(yaw)) * width / 2 + Math.abs(Math.sin(yaw)) * depth / 2;
    this.heldShield.collider.halfY = this.config.shieldHeight * 0.36;
    this.heldShield.collider.halfZ = Math.abs(Math.sin(yaw)) * width / 2 + Math.abs(Math.cos(yaw)) * depth / 2;
    this.heldShield.collider.onBlock = (attack) => {
      if ((attack.team !== "enemy" && attack.team !== "bot") || typeof player.absorbGuardShield !== "function") return;
      player.absorbGuardShield(attack.damage ?? this.config.projectileDamage);
    };
  }

  placeMine(player, yaw, team) {
    const direction = this.getForward(yaw);
    this.throwMine(player, direction, team);
  }

  placeMineAt(player, aimPoint, team, options = {}) {
    const origin = player.position.clone();
    origin.y += 1.25;
    const direction = aimPoint.clone().sub(origin);
    direction.y = 0;
    if (direction.lengthSq() === 0) return;
    direction.normalize();
    this.throwMine(player, direction, team, options);
  }

  throwMine(player, direction, team, options = {}) {
    const position = player.position.clone();
    position.y += 1.25;
    position.addScaledVector(direction, 1.0);

    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.16, 12), this.mineMaterial);
    mesh.userData.disposeMaterial = false;
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.thrownMines.push({
      mesh,
      position,
      velocity: new THREE.Vector3(
        direction.x * (options.throwSpeed ?? this.config.mineThrowSpeed),
        options.throwUpPower ?? this.config.mineThrowUpPower,
        direction.z * (options.throwSpeed ?? this.config.mineThrowSpeed)
      ),
      team,
      owner: options.owner ?? player,
      spin: 0,
      options
    });
  }

  armMine(thrownMine) {
    const position = thrownMine.position.clone();
    position.y = this.world.getHeightAt(position.x, position.z) + 0.16;
    thrownMine.mesh.position.copy(position);
    thrownMine.mesh.rotation.set(0, thrownMine.mesh.rotation.y, 0);

    this.mines.push({
      mesh: thrownMine.mesh,
      position,
      team: thrownMine.team,
      owner: thrownMine.options.owner ?? thrownMine.owner ?? null,
      life: thrownMine.options.fuse ?? this.config.mineFuse,
      armDelay: thrownMine.options.armDelay ?? this.config.mineArmDelay,
      triggerRadius: thrownMine.options.triggerRadius ?? this.config.mineTriggerRadius,
      explosionRadius: thrownMine.options.explosionRadius ?? this.config.explosionRadius,
      damage: thrownMine.options.damage ?? this.config.projectileDamage * 2
    });

    const index = this.thrownMines.indexOf(thrownMine);
    if (index >= 0) this.thrownMines.splice(index, 1);
  }

  createExplosion(position, radius = this.config.explosionRadius) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.explosionMaterial.clone());
    mesh.position.copy(position);
    this.scene.add(mesh);

    this.explosions.push({
      mesh,
      life: this.config.explosionDuration,
      maxLife: this.config.explosionDuration,
      radius
    });
  }

  disposeMesh(mesh) {
    mesh.traverse?.((child) => {
      if (!child.isMesh) return;
      if (child.userData.disposeGeometry !== false) child.geometry?.dispose?.();
      if (child.userData.disposeMaterial === false) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }

  removeItem(list, item) {
    const index = list.indexOf(item);
    if (index >= 0) list.splice(index, 1);
    if (item.mesh) {
      this.scene.remove(item.mesh);
      this.disposeMesh(item.mesh);
    }
  }

  clearAll() {
    this.removeHeldShield();
    this.shieldCooldownTimer = 0;
    this.rocketVolleys = [];
    for (const shield of [...this.shields]) {
      this.world.removeTemporaryCollider(shield.collider);
      this.removeItem(this.shields, shield);
    }
    for (const list of [this.projectiles, this.slashes, this.thrownMines, this.mines, this.explosions]) {
      for (const item of [...list]) {
        this.removeItem(list, item);
      }
    }
  }

  pointOnSegment(start, end, t) {
    return start.clone().lerp(end, t);
  }

  closestSegmentParam2D(start, end, targetPosition) {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSq = dx * dx + dz * dz;
    if (lengthSq <= 0.000001) return 0;

    const tx = targetPosition.x - start.x;
    const tz = targetPosition.z - start.z;
    return THREE.MathUtils.clamp((tx * dx + tz * dz) / lengthSq, 0, 1);
  }

  segmentIntersectsAabb(start, end, collider, padding = 0) {
    const ranges = [
      [start.x, end.x, collider.x - collider.halfX - padding, collider.x + collider.halfX + padding],
      [start.z, end.z, collider.z - collider.halfZ - padding, collider.z + collider.halfZ + padding]
    ];

    if (Number.isFinite(collider.y) && Number.isFinite(collider.halfY)) {
      ranges.push([
        start.y,
        end.y,
        collider.y - collider.halfY - padding,
        collider.y + collider.halfY + padding
      ]);
    }

    let enter = 0;
    let exit = 1;
    for (const [a, b, min, max] of ranges) {
      const delta = b - a;
      if (Math.abs(delta) <= 0.000001) {
        if (a < min || a > max) return false;
        continue;
      }

      const t1 = (min - a) / delta;
      const t2 = (max - a) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
      if (enter > exit) return false;
    }

    return true;
  }

  projectileHitsCollider(projectile, padding = null) {
    const colliderPadding = padding ?? projectile.hitRadius ?? this.config.projectileRadius ?? 0.22;
    const start = projectile.previousPosition ?? projectile.mesh.position;
    const end = projectile.mesh.position;
    return this.world.getColliders().some((collider) => {
      if (collider.blocksTeams && !collider.blocksTeams.includes(projectile.team)) {
        return false;
      }

      const hit = this.segmentIntersectsAabb(start, end, collider, colliderPadding);
      if (hit) collider.onBlock?.(projectile);
      return hit;
    });
  }

  horizontalDistance(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  verticalBodyHit(position, target, padding = 0) {
    const centerHeight = this.config.bodyHitCenterHeight ?? 0.9;
    const halfHeight = this.config.bodyHitHalfHeight ?? 2.0;
    const bodyCenterY = target.position.y + centerHeight;
    return Math.abs(position.y - bodyCenterY) <= halfHeight + padding;
  }

  bodyHit(position, target, horizontalRadius, verticalPadding = 0) {
    // 高さも見ることで、上昇中に足元より下を通った攻撃では被弾しないようにする。
    return this.horizontalDistance(position, target.position) <= horizontalRadius
      && this.verticalBodyHit(position, target, verticalPadding);
  }

  segmentHitsBody(start, end, target, horizontalRadius, verticalPadding = 0) {
    // 弾の「現在位置」だけでなく移動線分全体を見る。速い弾が体を通過した時の判定抜けを防ぐ。
    const t = this.closestSegmentParam2D(start, end, target.position);
    const closestPoint = this.pointOnSegment(start, end, t);
    return this.bodyHit(closestPoint, target, horizontalRadius, verticalPadding);
  }

  getAttackTargets(attack, player, enemies) {
    const aliveEnemies = enemies.filter((enemy) => enemy.hp > 0 && enemy !== attack.owner);
    if (attack.team === "player") return aliveEnemies;
    if (attack.team === "bot") {
      const targets = player.hp > 0 && player !== attack.owner ? [player] : [];
      return targets.concat(aliveEnemies);
    }
    return player.hp > 0 && player !== attack.owner ? [player] : [];
  }

  projectileHitsTarget(projectile, player, enemies) {
    const start = projectile.previousPosition ?? projectile.mesh.position;
    const end = projectile.mesh.position;
    const projectileRadius = projectile.hitRadius ?? this.config.projectileRadius ?? 0.22;
    const hitPadding = this.config.projectileHitPadding ?? 0.55;
    const verticalPadding = this.config.projectileVerticalHitPadding ?? 0.35;
    return this.getAttackTargets(projectile, player, enemies).find((target) => {
      return this.segmentHitsBody(start, end, target, target.radius + projectileRadius + hitPadding, verticalPadding + projectileRadius);
    }) || null;
  }

  explosionHitsTarget(position, target, radius) {
    const bodyCenter = target.position.clone();
    bodyCenter.y += this.config.bodyHitCenterHeight ?? 0.05;
    return position.distanceTo(bodyCenter) <= radius + (target.radius ?? 0.68);
  }

  applyExplosionDamage(position, projectile, player, enemies, callbacks = {}) {
    const radius = projectile.explosionRadius ?? 0;
    if (radius <= 0) return false;

    const damage = projectile.explosionDamage ?? projectile.damage;
    const targets = this.getAttackTargets(projectile, player, enemies);
    let hitAny = false;
    for (const target of targets) {
      if (!this.explosionHitsTarget(position, target, radius)) continue;
      hitAny = true;
      if (target.takeDamage(damage, { team: projectile.team, type: "explosion" })) {
        if (target === player) callbacks.onPlayerDeath?.(projectile);
        else callbacks.onEnemyDeath?.(target, projectile);
      }
    }
    return hitAny;
  }

  resolveProjectileImpact(projectile, target, player, enemies, callbacks = {}) {
    if (projectile.explosionRadius > 0) {
      this.applyExplosionDamage(projectile.mesh.position, projectile, player, enemies, callbacks);
      return;
    }

    if (target.takeDamage(projectile.damage, projectile)) {
      if (target === player) callbacks.onPlayerDeath?.(projectile);
      else callbacks.onEnemyDeath?.(target, projectile);
    }
  }

  mineTriggeredTarget(mine, player, enemies) {
    const targets = this.getAttackTargets(mine, player, enemies);
    return targets.find((target) => {
      return this.horizontalDistance(mine.position, target.position) <= mine.triggerRadius;
    }) || null;
  }

  startRocketVolley(actor, aimPoint, team = "player", options = {}) {
    this.rocketVolleys.push({
      actor,
      aimPoint: aimPoint.clone(),
      team,
      options: { ...options, owner: options.owner ?? actor },
      remaining: options.count ?? 6,
      timer: 0
    });
  }

  updateRocketVolleys(dt) {
    for (const volley of [...this.rocketVolleys]) {
      volley.timer -= dt;
      if (volley.remaining > 0 && volley.timer <= 0) {
        const spread = volley.options.spread ?? 1.35;
        const sideOffset = (volley.remaining - 1 - ((volley.options.count ?? 6) - 1) / 2) * spread;
        const aimPoint = volley.aimPoint.clone().add(new THREE.Vector3(sideOffset, 0, 0));
        this.projectileAt(volley.actor, aimPoint, volley.team, volley.options.color ?? 0xff7a1a, {
          radius: volley.options.radius ?? 0.5,
          originHeight: volley.options.originHeight ?? 1.72,
          targetHeight: volley.options.targetHeight ?? 1.25,
          verticalAimScale: volley.options.verticalAimScale ?? 0.28,
          damage: volley.options.damage ?? 12,
          speed: volley.options.speed ?? 31,
          lifetime: volley.options.lifetime ?? 2.6,
          hitRadius: volley.options.hitRadius ?? 0.72,
          explosionRadius: volley.options.explosionRadius ?? 3.2,
          explosionDamage: volley.options.explosionDamage ?? 19,
          playerAimCorrection: volley.options.playerAimCorrection,
          pitch: volley.options.pitch,
          owner: volley.options.owner ?? volley.actor,
          opacity: 0.94
        });
        volley.remaining -= 1;
        volley.timer = volley.options.interval ?? 0.17;
      }

      if (volley.remaining <= 0 && volley.timer <= 0) {
        const index = this.rocketVolleys.indexOf(volley);
        if (index >= 0) this.rocketVolleys.splice(index, 1);
      }
    }
  }

  update(dt, player, enemies, callbacks = {}) {
    this.shieldCooldownTimer = Math.max(0, this.shieldCooldownTimer - dt);
    this.updateRocketVolleys(dt);

    for (const slash of [...this.slashes]) {
      slash.life -= dt;
      const step = slash.speed * dt;
      slash.traveled += step;
      slash.previousPosition.copy(slash.mesh.position);
      slash.mesh.position.addScaledVector(slash.direction, step);
      slash.mesh.rotation.z += dt * 9;
      slash.mesh.material.opacity = Math.max(0.12, 0.68 * (slash.life / (this.config.slashLifetime || 1)));

      const slashVerticalPadding = this.config.slashVerticalHitPadding ?? 0.9;
      const hitTarget = this.getAttackTargets(slash, player, enemies).find((target) => this.segmentHitsBody(
          slash.previousPosition,
          slash.mesh.position,
          target,
          target.radius + slash.hitRadius,
          slashVerticalPadding
        )) || null;
      const expired = slash.life <= 0 || slash.traveled >= slash.maxDistance;
      const blocked = this.projectileHitsCollider(slash, Math.min(slash.hitRadius ?? 0.8, 0.8));

      if (blocked) {
        this.createExplosion(slash.mesh.position);
        this.removeItem(this.slashes, slash);
      } else if (hitTarget) {
        if (hitTarget.takeDamage(slash.damage, { team: slash.team, type: "slash" })) {
          if (hitTarget === player) callbacks.onPlayerDeath?.(slash);
          else callbacks.onEnemyDeath?.(hitTarget, slash);
        }
        this.createExplosion(slash.mesh.position);
        this.removeItem(this.slashes, slash);
      } else if (expired) {
        this.removeItem(this.slashes, slash);
      }
    }

    for (const projectile of [...this.projectiles]) {
      projectile.life -= dt;
      projectile.previousPosition.copy(projectile.mesh.position);
      projectile.mesh.position.addScaledVector(projectile.direction, projectile.speed * dt);
      const target = this.projectileHitsTarget(projectile, player, enemies);

      if (target) {
        this.resolveProjectileImpact(projectile, target, player, enemies, callbacks);
        this.createExplosion(projectile.mesh.position, projectile.explosionRadius || this.config.explosionRadius);
        this.removeItem(this.projectiles, projectile);
      } else if (projectile.life <= 0 || this.projectileHitsCollider(projectile)) {
        this.applyExplosionDamage(projectile.mesh.position, projectile, player, enemies, callbacks);
        this.createExplosion(projectile.mesh.position, projectile.explosionRadius || this.config.explosionRadius);
        this.removeItem(this.projectiles, projectile);
      }
    }

    for (const shield of [...this.shields]) {
      shield.life -= dt;
      shield.mesh.material.opacity = Math.max(0, 0.38 * (shield.life / this.config.shieldDuration));
      if (shield.life <= 0) {
        this.world.removeTemporaryCollider(shield.collider);
        this.removeItem(this.shields, shield);
      }
    }

    for (const thrownMine of [...this.thrownMines]) {
      thrownMine.velocity.y += this.config.mineThrowGravity * dt;
      thrownMine.position.addScaledVector(thrownMine.velocity, dt);
      thrownMine.mesh.position.copy(thrownMine.position);
      thrownMine.mesh.rotation.x += dt * 8;
      thrownMine.mesh.rotation.z += dt * 5;

      const groundY = this.world.getHeightAt(thrownMine.position.x, thrownMine.position.z) + 0.16;
      if (thrownMine.position.y <= groundY) {
        this.armMine(thrownMine);
      }
    }

    for (const mine of [...this.mines]) {
      mine.life -= dt;
      mine.armDelay -= dt;
      mine.mesh.rotation.y += dt * 4;
      const armed = mine.armDelay <= 0;
      const target = armed ? this.mineTriggeredTarget(mine, player, enemies) : null;

      if (target) {
        if (target.takeDamage(mine.damage, { team: mine.team, type: "mine" })) {
          if (target === player) callbacks.onPlayerDeath?.(mine);
          else callbacks.onEnemyDeath?.(target, mine);
        }
        this.createExplosion(mine.position, mine.explosionRadius);
        this.removeItem(this.mines, mine);
      } else if (mine.life <= 0) {
        this.createExplosion(mine.position, mine.explosionRadius);
        this.removeItem(this.mines, mine);
      }
    }

    for (const explosion of [...this.explosions]) {
      explosion.life -= dt;
      const progress = 1 - explosion.life / explosion.maxLife;
      if (explosion.isBeam) {
        explosion.tickTimer -= dt;
        while (explosion.tickTimer <= 0 && explosion.life > 0) {
          this.applyBeamDamage(explosion, player, enemies, callbacks);
          explosion.tickTimer += explosion.tickInterval;
        }

        const fadeWindow = Math.min(0.32, explosion.maxLife * 0.35);
        const fade = THREE.MathUtils.clamp(explosion.life / Math.max(0.001, fadeWindow), 0, 1);
        const pulse = 0.82 + Math.sin(performance.now() * 0.022) * 0.18;
        explosion.mesh.material.opacity = Math.max(0, explosion.baseOpacity * fade * pulse);
      } else {
        explosion.mesh.scale.setScalar(0.4 + progress * (explosion.radius ?? this.config.explosionRadius));
        explosion.mesh.material.opacity = Math.max(0, 0.72 * (1 - progress));
      }

      if (explosion.life <= 0) {
        this.removeItem(this.explosions, explosion);
      }
    }
  }
}
