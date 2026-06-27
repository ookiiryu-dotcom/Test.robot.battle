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
    const material = this.projectileMaterial.clone();
    material.color.setHex(color);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.config.projectileRadius, 12, 8), material);
    mesh.position.copy(actor.position);
    mesh.position.y += 1.55;
    mesh.position.addScaledVector(direction, 1.1);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      direction,
      team,
      damage: options.damage ?? this.config.projectileDamage,
      speed: options.speed ?? this.config.projectileSpeed,
      life: options.lifetime ?? this.config.projectileLifetime
    });
  }

  shootAt(actor, aimPoint, team = "player", color = 0xfff4a3, options = {}) {
    const origin = actor.position.clone();
    origin.y += 1.55;
    const direction = aimPoint.clone().sub(origin);
    if (direction.lengthSq() === 0) return;
    direction.normalize();

    const material = this.projectileMaterial.clone();
    material.color.setHex(color);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.config.projectileRadius, 12, 8), material);
    mesh.position.copy(origin).addScaledVector(direction, 1.1);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      direction,
      team,
      damage: options.damage ?? this.config.projectileDamage,
      speed: options.speed ?? this.config.projectileSpeed,
      life: options.lifetime ?? this.config.projectileLifetime
    });
  }

  slashFrom(actor, target, options = {}) {
    const origin = actor.position.clone();
    origin.y += options.originHeight ?? this.config.slashOriginHeight ?? 1.55;
    const aimPoint = target.position.clone();
    aimPoint.y += options.targetHeight ?? this.config.slashTargetHeight ?? 1.2;
    const direction = aimPoint.sub(origin);
    direction.y *= 0.18;
    if (direction.lengthSq() === 0) return;
    direction.normalize();

    const yaw = Math.atan2(direction.x, direction.z);
    const material = this.slashMaterial.clone();
    const mesh = new THREE.Mesh(this.slashGeometry, material);
    mesh.position.copy(origin).addScaledVector(direction, 1.3);
    mesh.rotation.y = yaw;
    mesh.rotation.z = -0.55;
    mesh.scale.set(1.2, 1.2, 1.2);
    this.scene.add(mesh);

    this.slashes.push({
      mesh,
      direction,
      team: "enemy",
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
      z: center.z,
      halfX: Math.abs(Math.cos(yaw)) * this.config.shieldWidth / 2 + Math.abs(Math.sin(yaw)) * 0.14,
      halfZ: Math.abs(Math.sin(yaw)) * this.config.shieldWidth / 2 + Math.abs(Math.cos(yaw)) * 0.14,
      blocksTeams: ["enemy"]
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
      z: 0,
      halfX: 0,
      halfZ: 0,
      blocksTeams: ["enemy"]
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
    this.heldShield.collider.z = center.z;
    this.heldShield.collider.halfX = Math.abs(Math.cos(yaw)) * width / 2 + Math.abs(Math.sin(yaw)) * depth / 2;
    this.heldShield.collider.halfZ = Math.abs(Math.sin(yaw)) * width / 2 + Math.abs(Math.cos(yaw)) * depth / 2;
  }

  placeMine(player, yaw, team) {
    const direction = this.getForward(yaw);
    const position = player.position.clone();
    position.y += 1.25;
    position.addScaledVector(direction, 1.0);

    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.16, 12), this.mineMaterial);
    mesh.position.copy(position);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.thrownMines.push({
      mesh,
      position,
      velocity: new THREE.Vector3(
        direction.x * this.config.mineThrowSpeed,
        this.config.mineThrowUpPower,
        direction.z * this.config.mineThrowSpeed
      ),
      team,
      spin: 0
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
      life: this.config.mineFuse,
      armDelay: this.config.mineArmDelay
    });

    const index = this.thrownMines.indexOf(thrownMine);
    if (index >= 0) this.thrownMines.splice(index, 1);
  }

  createExplosion(position) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.explosionMaterial.clone());
    mesh.position.copy(position);
    this.scene.add(mesh);

    this.explosions.push({
      mesh,
      life: this.config.explosionDuration,
      maxLife: this.config.explosionDuration
    });
  }

  removeItem(list, item) {
    const index = list.indexOf(item);
    if (index >= 0) list.splice(index, 1);
    if (item.mesh) this.scene.remove(item.mesh);
  }

  clearAll() {
    this.removeHeldShield();
    this.shieldCooldownTimer = 0;
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

  projectileHitsCollider(projectile) {
    return this.world.getColliders().some((collider) => {
      if (collider.blocksTeams && !collider.blocksTeams.includes(projectile.team)) {
        return false;
      }

      const position = projectile.mesh.position;
      return Math.abs(position.x - collider.x) <= collider.halfX && Math.abs(position.z - collider.z) <= collider.halfZ;
    });
  }

  horizontalDistance(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  projectileHitsTarget(projectile, player, enemies) {
    if (projectile.team === "enemy") {
      if (this.horizontalDistance(projectile.mesh.position, player.position) <= player.radius + 0.9) {
        return player;
      }
      return null;
    }

    return enemies.find((enemy) => {
      return enemy.hp > 0 && this.horizontalDistance(projectile.mesh.position, enemy.position) <= enemy.radius + 0.9;
    }) || null;
  }

  mineTriggeredTarget(mine, player, enemies) {
    const targets = mine.team === "player" ? enemies.filter((enemy) => enemy.hp > 0) : [player];
    return targets.find((target) => {
      return this.horizontalDistance(mine.position, target.position) <= this.config.mineTriggerRadius;
    }) || null;
  }

  update(dt, player, enemies, callbacks = {}) {
    this.shieldCooldownTimer = Math.max(0, this.shieldCooldownTimer - dt);

    for (const slash of [...this.slashes]) {
      slash.life -= dt;
      const step = slash.speed * dt;
      slash.traveled += step;
      slash.mesh.position.addScaledVector(slash.direction, step);
      slash.mesh.rotation.z += dt * 9;
      slash.mesh.material.opacity = Math.max(0.12, 0.68 * (slash.life / (this.config.slashLifetime || 1)));

      const hitPlayer = this.horizontalDistance(slash.mesh.position, player.position) <= player.radius + slash.hitRadius;
      const expired = slash.life <= 0 || slash.traveled >= slash.maxDistance;
      const blocked = this.projectileHitsCollider(slash);

      if (blocked) {
        this.createExplosion(slash.mesh.position);
        this.removeItem(this.slashes, slash);
      } else if (hitPlayer) {
        if (player.takeDamage(slash.damage)) callbacks.onPlayerDeath?.();
        this.createExplosion(slash.mesh.position);
        this.removeItem(this.slashes, slash);
      } else if (expired) {
        this.removeItem(this.slashes, slash);
      }
    }

    for (const projectile of [...this.projectiles]) {
      projectile.life -= dt;
      projectile.mesh.position.addScaledVector(projectile.direction, projectile.speed * dt);
      const target = this.projectileHitsTarget(projectile, player, enemies);

      if (target) {
        if (target.takeDamage(projectile.damage)) {
          if (target === player) callbacks.onPlayerDeath?.();
          else callbacks.onEnemyDeath?.(target);
        }
        this.createExplosion(projectile.mesh.position);
        this.removeItem(this.projectiles, projectile);
      } else if (projectile.life <= 0 || this.projectileHitsCollider(projectile)) {
        this.createExplosion(projectile.mesh.position);
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
        if (target.takeDamage(this.config.projectileDamage * 2)) {
          if (target === player) callbacks.onPlayerDeath?.();
          else callbacks.onEnemyDeath?.(target);
        }
        this.createExplosion(mine.position);
        this.removeItem(this.mines, mine);
      } else if (mine.life <= 0) {
        this.createExplosion(mine.position);
        this.removeItem(this.mines, mine);
      }
    }

    for (const explosion of [...this.explosions]) {
      explosion.life -= dt;
      const progress = 1 - explosion.life / explosion.maxLife;
      explosion.mesh.scale.setScalar(0.4 + progress * this.config.explosionRadius);
      explosion.mesh.material.opacity = Math.max(0, 0.72 * (1 - progress));

      if (explosion.life <= 0) {
        this.removeItem(this.explosions, explosion);
      }
    }
  }
}
