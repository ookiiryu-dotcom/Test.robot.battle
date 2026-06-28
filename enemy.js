import * as THREE from "three";
import { Player } from "./player.js";

export class Enemy extends Player {
  constructor(scene, config, world, typeConfig, index) {
    super(scene, config, world);
    this.typeConfig = typeConfig;
    this.index = index;
    this.typeId = typeConfig.id;
    this.displayName = typeConfig.name;
    this.maxHp = typeConfig.maxHp ?? config.enemy.maxHp;
    this.hp = this.maxHp;
    this.shootTimer = this.getShootInterval();
    this.respawnTimer = 0;
    this.aiState = "keepDistance";
    this.stateTimer = 0;
    this.strafeDirection = index % 2 === 0 ? 1 : -1;
    this.strafeTimer = 0.8 + Math.random() * 0.7;
    this.dodgeCooldownTimer = 0.9 + Math.random() * 0.8;
    this.guardCooldownTimer = 1.4 + Math.random() * 1.2;
    this.superJumpCooldownTimer = 2.2 + Math.random() * 1.4;
    this.specialEnergyMax = this.getEnemyValue("specialEnergyMax", 100);
    this.specialEnergy = this.specialEnergyMax * this.getEnemyValue("initialSpecialEnergyRate", 0.28);
    this.specialEnergyRegen = this.getEnemyValue("specialEnergyRegen", 10);
    this.specialCost = this.getEnemyValue("specialCost", this.specialEnergyMax);
    this.specialCooldownTimer = this.getEnemyValue("specialStartCooldown", 2.5);
    this.pendingSpecial = null;
    this.rocketVolleyRemaining = 0;
    this.rocketVolleyTimer = 0;
    this.shieldMax = this.getEnemyValue("shieldDurability", 0);
    this.shieldDurability = this.shieldMax;
    this.shieldBrokenTimer = 0;
    this.guardActive = false;
    this.dodgeDirection = new THREE.Vector3();
    this.coverTarget = null;
    this.superJumpFrom = new THREE.Vector3();
    this.superJumpTo = new THREE.Vector3();
    this.superJumpElapsed = 0;
    this.team = "enemy";
    this.projectileTeam = "enemy";
    this.targetSwitchTimer = 0;
    this.currentTarget = null;
    this.simpleCombatTimer = 0.8 + Math.random() * 1.4;
    this.group.userData.team = "enemy";
    this.applyEnemyLook();
    this.createGuardEffect();
    this.createTypeEffects();
    this.createHealthBar();
  }

  getShootInterval() {
    return this.typeConfig.attackCooldown
      ?? this.typeConfig.slashCooldown
      ?? this.config.enemy.slashCooldown
      ?? this.config.enemy.shootInterval;
  }

  applyEnemyLook() {
    this.applyCharacterVisual(this.typeConfig);
  }

  resetAt(x, z) {
    this.setPosition(x, z);
    this.restoreHp();
    this.shootTimer = this.getShootInterval();
    this.respawnTimer = 0;
    this.aiState = "keepDistance";
    this.stateTimer = 0;
    this.guardActive = false;
    this.coverTarget = null;
    this.strafeTimer = 0.6 + Math.random() * 0.8;
    this.dodgeCooldownTimer = 0.9 + Math.random() * 0.8;
    this.guardCooldownTimer = 1.4 + Math.random() * 1.2;
    this.superJumpCooldownTimer = 2.2 + Math.random() * 1.4;
    this.specialEnergyMax = this.getEnemyValue("specialEnergyMax", 100);
    this.specialEnergy = this.specialEnergyMax * this.getEnemyValue("initialSpecialEnergyRate", 0.28);
    this.specialEnergyRegen = this.getEnemyValue("specialEnergyRegen", 10);
    this.specialCost = this.getEnemyValue("specialCost", this.specialEnergyMax);
    this.specialCooldownTimer = this.getEnemyValue("specialStartCooldown", 2.5);
    this.pendingSpecial = null;
    this.rocketVolleyRemaining = 0;
    this.rocketVolleyTimer = 0;
    this.shieldMax = this.getEnemyValue("shieldDurability", 0);
    this.shieldDurability = this.shieldMax;
    this.shieldBrokenTimer = 0;
    if (this.guardMesh) this.guardMesh.visible = false;
    this.updateGuardShieldEffect();
    this.updateHealthBar();
    this.group.visible = true;
  }

  getEnemyValue(name, fallback) {
    return this.typeConfig[name] ?? this.config.enemy[name] ?? fallback;
  }

  setAiState(state, duration = 0) {
    this.aiState = state;
    this.stateTimer = duration;
  }

  createGuardEffect() {
    const material = new THREE.MeshBasicMaterial({
      color: 0x8ff7ff,
      transparent: true,
      opacity: 0.22,
      wireframe: true
    });
    this.guardMesh = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 10), material);
    this.guardMesh.position.set(0, 0.78, 0);
    this.guardMesh.scale.set(1.05, 1.18, 1.05);
    this.guardMesh.visible = false;
    this.group.add(this.guardMesh);
  }

  createTypeEffects() {
    if (this.typeId !== "guard") return;

    const shieldMaterial = new THREE.MeshStandardMaterial({
      color: 0xa3e635,
      emissive: 0x84cc16,
      emissiveIntensity: 0.74,
      roughness: 0.18,
      metalness: 0.04,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      flatShading: true,
      depthWrite: false
    });
    const shieldGeometry = new THREE.BoxGeometry(0.18, 1.55, 1.05);
    this.guardShieldMesh = new THREE.Mesh(shieldGeometry, shieldMaterial);
    this.guardShieldMesh.position.set(-0.92, 0.44, 0.42);
    this.guardShieldMesh.rotation.z = -0.08;
    const shieldEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(shieldGeometry, 12),
      new THREE.LineBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.66 })
    );
    this.guardShieldMesh.add(shieldEdges);
    this.group.add(this.guardShieldMesh);
    this.updateGuardShieldEffect();
  }

  createHealthBar() {
    const width = this.config.enemy.headHpBarWidth ?? 1.7;
    const height = this.config.enemy.headHpBarHeight ?? 0.14;
    const y = this.config.enemy.headHpBarHeightOffset ?? 3.55;
    const backMaterial = new THREE.SpriteMaterial({
      color: 0x020817,
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    });
    const fillMaterial = new THREE.SpriteMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.96,
      depthWrite: false
    });

    this.hpBarWidth = width;
    this.hpBarHeight = height;
    this.hpBarGroup = new THREE.Group();
    this.hpBarGroup.position.set(0, y, 0);
    this.hpBarBack = new THREE.Sprite(backMaterial);
    this.hpBarFill = new THREE.Sprite(fillMaterial);
    this.hpBarBack.scale.set(width + 0.12, height + 0.08, 1);
    this.hpBarFill.scale.set(width, height, 1);
    this.hpBarFill.position.z = 0.01;
    this.hpBarGroup.add(this.hpBarBack, this.hpBarFill);
    this.group.add(this.hpBarGroup);
    this.updateHealthBar();
  }

  updateHealthBar() {
    if (!this.hpBarGroup || !this.hpBarFill) return;

    const rate = this.maxHp > 0 ? THREE.MathUtils.clamp(this.hp / this.maxHp, 0, 1) : 0;
    this.hpBarGroup.visible = this.hp > 0;
    this.hpBarFill.scale.x = Math.max(0.001, this.hpBarWidth * rate);
    this.hpBarFill.scale.y = this.hpBarHeight;
    this.hpBarFill.position.x = -this.hpBarWidth * (1 - rate) * 0.5;

    const color = rate > 0.5 ? 0x22c55e : rate > 0.25 ? 0xfacc15 : 0xef4444;
    this.hpBarFill.material.color.setHex(color);
  }

  updateGuardEffect() {
    if (!this.guardMesh) return;
    this.guardMesh.visible = this.guardActive;
    if (this.guardActive) {
      const pulse = 1 + Math.sin(performance.now() * 0.014) * 0.08;
      this.guardMesh.scale.set(1.05 * pulse, 1.18 * pulse, 1.05 * pulse);
    }
  }

  updateGuardShieldEffect() {
    if (!this.guardShieldMesh) return;
    const rate = this.shieldMax > 0 ? this.shieldDurability / this.shieldMax : 0;
    this.guardShieldMesh.visible = this.typeId === "guard" && rate > 0.01;
    this.guardShieldMesh.material.opacity = 0.16 + rate * 0.5;
    this.guardShieldMesh.scale.set(1, 0.72 + rate * 0.38, 0.72 + rate * 0.32);
  }

  updateShieldRegen(dt) {
    if (this.typeId !== "guard" || this.shieldMax <= 0) return;

    if (this.shieldDurability <= 0) {
      this.shieldBrokenTimer = Math.max(0, this.shieldBrokenTimer - dt);
      if (this.shieldBrokenTimer > 0) {
        this.updateGuardShieldEffect();
        return;
      }
    }

    this.shieldDurability = Math.min(this.shieldMax, this.shieldDurability + this.getEnemyValue("shieldRegen", 10) * dt);
    this.updateGuardShieldEffect();
  }

  absorbWithShield(amount, source) {
    if (this.typeId !== "guard" || this.shieldDurability <= 0 || source?.owner === this || source?.team === "enemy") return false;
    this.shieldDurability = Math.max(0, this.shieldDurability - amount);
    if (this.shieldDurability <= 0) {
      this.shieldBrokenTimer = this.getEnemyValue("shieldRegenDelay", 2.5);
    }
    this.updateGuardShieldEffect();
    return true;
  }

  takeDamage(amount, source = null) {
    if (source?.type !== "zone" && this.absorbWithShield(amount, source)) {
      return false;
    }

    const guardMultiplier = this.getEnemyValue("guardDamageMultiplier", 0.35);
    const damage = source?.type === "zone"
      ? amount
      : this.guardActive ? Math.max(1, Math.ceil(amount * guardMultiplier)) : amount;
    this.hp = Math.max(0, this.hp - damage);
    this.updateHealthBar();
    return this.hp <= 0;
  }

  keepOnGround() {
    this.position.y = this.world.getHeightAt(this.position.x, this.position.z) + this.groundOffset + this.groundClearance;
  }

  closestPointOnCollider(collider, point, padding = 0) {
    return new THREE.Vector3(
      THREE.MathUtils.clamp(point.x, collider.x - collider.halfX - padding, collider.x + collider.halfX + padding),
      0,
      THREE.MathUtils.clamp(point.z, collider.z - collider.halfZ - padding, collider.z + collider.halfZ + padding)
    );
  }

  isPointInsideCollider(point, collider, padding = 0) {
    return Math.abs(point.x - collider.x) <= collider.halfX + padding
      && Math.abs(point.z - collider.z) <= collider.halfZ + padding;
  }

  pushPointOutsideColliders(point, padding = this.radius + 0.35) {
    const result = point.clone();

    for (const collider of this.world.getColliders()) {
      if (collider.blocksTeams && !collider.blocksTeams.includes("enemy")) continue;
      if (!this.isPointInsideCollider(result, collider, padding)) continue;

      const dx = result.x - collider.x;
      const dz = result.z - collider.z;
      const overlapX = collider.halfX + padding - Math.abs(dx);
      const overlapZ = collider.halfZ + padding - Math.abs(dz);

      if (overlapX < overlapZ) {
        result.x += Math.sign(dx || 1) * overlapX;
      } else {
        result.z += Math.sign(dz || 1) * overlapZ;
      }
    }

    return result;
  }

  getNearestBlockingCollider(nextPosition, currentPosition) {
    const padding = this.radius + this.getEnemyValue("obstacleAvoidPadding", 0.9);
    let nearest = null;
    let nearestDistanceSq = Infinity;

    for (const collider of this.world.getColliders()) {
      if (collider.blocksTeams && !collider.blocksTeams.includes("enemy")) continue;

      const insideNext = this.isPointInsideCollider(nextPosition, collider, padding);
      if (!insideNext) continue;

      const closest = this.closestPointOnCollider(collider, currentPosition);
      const distanceSq = closest.distanceToSquared(currentPosition);
      if (distanceSq < nearestDistanceSq) {
        nearest = collider;
        nearestDistanceSq = distanceSq;
      }
    }

    return nearest;
  }

  steerAroundObstacle(move, dt) {
    if (move.lengthSq() === 0) return move;

    const speed = move.length();
    const direction = move.clone().normalize();
    const lookAhead = Math.max(this.getEnemyValue("obstacleAvoidDistance", 3.6), speed * dt * 1.8);
    const nextPosition = this.position.clone().addScaledVector(direction, lookAhead);
    const collider = this.getNearestBlockingCollider(nextPosition, this.position);
    if (!collider) return move;

    const centerToEnemy = new THREE.Vector3(this.position.x - collider.x, 0, this.position.z - collider.z);
    const tangentA = new THREE.Vector3(-direction.z, 0, direction.x);
    const tangentB = tangentA.clone().multiplyScalar(-1);
    const preferredTangent = tangentA.dot(centerToEnemy) >= tangentB.dot(centerToEnemy) ? tangentA : tangentB;
    const avoidStrength = this.getEnemyValue("obstacleAvoidStrength", 1.15);

    return move
      .clone()
      .addScaledVector(preferredTangent, speed * avoidStrength)
      .clampLength(0, this.getEnemyValue("strafeMaxSpeed", 7.2));
  }

  moveByVector(move, dt) {
    if (move.lengthSq() === 0) return false;
    const steeredMove = this.steerAroundObstacle(move, dt);
    this.position.x += steeredMove.x * dt;
    this.position.z += steeredMove.z * dt;
    this.resolveBarrierCollision();
    this.keepOnGround();
    this.group.position.copy(this.position);
    return true;
  }

  moveToward(player, speed, dt, retreat = false) {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const move = new THREE.Vector3(dx, 0, dz);
    if (move.lengthSq() === 0) return false;

    move.normalize();
    if (retreat) move.multiplyScalar(-1);
    return this.moveByVector(move.multiplyScalar(speed), dt);
  }

  strafeAround(player, dt, distance, minDistance, maxDistance) {
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = this.getEnemyValue("strafeChangeInterval", 1.15) + Math.random() * 0.7;
      if (Math.random() < 0.42) this.strafeDirection *= -1;
    }

    const toPlayer = new THREE.Vector3(player.position.x - this.position.x, 0, player.position.z - this.position.z);
    if (toPlayer.lengthSq() === 0) return false;
    const radial = toPlayer.normalize();
    const tangent = new THREE.Vector3(-radial.z, 0, radial.x).multiplyScalar(this.strafeDirection);
    const move = tangent.multiplyScalar(this.getEnemyValue("strafeSpeed", 4.8));

    const idealMin = minDistance + 2;
    const idealMax = maxDistance - 3;
    if (distance < idealMin) {
      move.addScaledVector(radial, -this.getEnemyValue("spacingSpeed", 3.8));
    } else if (distance > idealMax) {
      move.addScaledVector(radial, this.getEnemyValue("spacingSpeed", 3.8));
    }

    move.clampLength(0, this.getEnemyValue("strafeMaxSpeed", 7.2));
    return this.moveByVector(move, dt);
  }

  findThreateningProjectile(skills) {
    const detectDistance = this.getEnemyValue("dodgeDetectDistance", 8);
    const avoidWidth = this.radius + this.getEnemyValue("dodgeAvoidWidth", 1.45);

    return skills.projectiles.find((projectile) => {
      if (projectile.owner === this) return false;
      if (this.projectileTeam === "bot") {
        if (projectile.team !== "player" && projectile.team !== "bot") return false;
      } else if (projectile.team !== "player") {
        return false;
      }

      const toEnemy = new THREE.Vector3(
        this.position.x - projectile.mesh.position.x,
        0,
        this.position.z - projectile.mesh.position.z
      );
      const distance = toEnemy.length();
      if (distance <= 0.01 || distance > detectDistance) return false;

      const direction = projectile.direction.clone();
      direction.y = 0;
      if (direction.lengthSq() === 0) return false;
      direction.normalize();

      const closing = direction.dot(toEnemy.clone().normalize());
      const closestOffset = toEnemy.sub(direction.clone().multiplyScalar(toEnemy.dot(direction))).length();
      return closing > 0.72 && closestOffset < avoidWidth;
    }) || null;
  }

  findCoverPoint(player, threat = null) {
    const searchRadius = this.getEnemyValue("coverSearchRadius", 18);
    const coverOffset = this.radius + this.getEnemyValue("coverOffset", 2.4);
    const threatSource = threat?.mesh?.position ?? player.position;
    let bestPoint = null;
    let bestScore = Infinity;

    for (const collider of this.world.getColliders()) {
      if (collider.blocksTeams && !collider.blocksTeams.includes("enemy")) continue;

      const colliderCenter = new THREE.Vector3(collider.x, 0, collider.z);
      const distanceToEnemy = colliderCenter.distanceTo(new THREE.Vector3(this.position.x, 0, this.position.z));
      if (distanceToEnemy > searchRadius) continue;

      const fromThreat = colliderCenter.clone().sub(new THREE.Vector3(threatSource.x, 0, threatSource.z));
      if (fromThreat.lengthSq() === 0) continue;
      fromThreat.normalize();

      const coverDistance = Math.max(collider.halfX, collider.halfZ) + coverOffset;
      const candidate = this.pushPointOutsideColliders(colliderCenter.addScaledVector(fromThreat, coverDistance));
      if (this.isPointInsideCollider(candidate, collider, this.radius + 0.25)) continue;

      // Prefer cover that is nearby and puts the obstacle between the player/projectile and enemy.
      const threatToCandidate = candidate.distanceTo(new THREE.Vector3(threatSource.x, 0, threatSource.z));
      const threatToCollider = new THREE.Vector3(collider.x, 0, collider.z).distanceTo(new THREE.Vector3(threatSource.x, 0, threatSource.z));
      if (threatToCandidate <= threatToCollider) continue;

      const score = distanceToEnemy + Math.abs(candidate.distanceTo(player.position) - this.getEnemyValue("coverIdealDistance", 15)) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        bestPoint = candidate;
      }
    }

    return bestPoint;
  }

  startDodge(projectile) {
    this.coverTarget = null;
    const incoming = projectile.direction.clone();
    incoming.y = 0;
    if (incoming.lengthSq() === 0) return false;
    incoming.normalize();

    const side = Math.random() < 0.5 ? -1 : 1;
    this.dodgeDirection.set(-incoming.z * side, 0, incoming.x * side).normalize();
    this.dodgeCooldownTimer = this.getEnemyValue("dodgeCooldown", 2.1);
    this.guardActive = false;
    this.setAiState("dodge", this.getEnemyValue("dodgeDuration", 0.28));
    return true;
  }

  startCoverDodge(coverPoint) {
    this.coverTarget = coverPoint.clone();
    this.dodgeCooldownTimer = this.getEnemyValue("dodgeCooldown", 2.1);
    this.guardActive = false;
    this.setAiState("dodge", this.getEnemyValue("coverDodgeDuration", 0.55));
  }

  startGuard() {
    this.guardActive = true;
    this.guardCooldownTimer = this.getEnemyValue("guardCooldown", 4.2);
    this.setAiState("guard", this.getEnemyValue("guardDuration", 0.85));
  }

  startSuperJump(player) {
    const away = new THREE.Vector3(this.position.x - player.position.x, 0, this.position.z - player.position.z);
    if (away.lengthSq() === 0) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize();

    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 0.35);
    const jumpDirection = away.add(side).normalize();
    this.superJumpFrom.copy(this.position);
    this.superJumpTo.copy(this.pushPointOutsideColliders(
      this.position.clone().addScaledVector(jumpDirection, this.getEnemyValue("superJumpDistance", 11)),
      this.radius + 0.65
    ));
    this.superJumpElapsed = 0;
    this.superJumpCooldownTimer = this.getEnemyValue("superJumpCooldown", 5.5);
    this.guardActive = false;
    this.coverTarget = null;
    this.setAiState("superJump", this.getEnemyValue("superJumpDuration", 0.55));
  }

  runDodge(dt) {
    if (this.coverTarget) {
      const toCover = this.coverTarget.clone().sub(this.position);
      toCover.y = 0;
      if (toCover.lengthSq() < 0.5) {
        this.coverTarget = null;
        return false;
      }

      toCover.normalize().multiplyScalar(this.getEnemyValue("coverMoveSpeed", this.getEnemyValue("dodgeSpeed", 15)));
      return this.moveByVector(toCover, dt);
    }

    const dodgeDuration = Math.max(0.01, this.getEnemyValue("dodgeDuration", 0.28));
    const dodgeDistance = this.getEnemyValue("dodgeDistance", null);
    const speed = dodgeDistance !== null ? dodgeDistance / dodgeDuration : this.getEnemyValue("dodgeSpeed", 15);
    return this.moveByVector(this.dodgeDirection.clone().multiplyScalar(speed), dt);
  }

  runSuperJump(dt) {
    const duration = this.getEnemyValue("superJumpDuration", 0.55);
    const height = this.getEnemyValue("superJumpHeight", 7.5);
    this.superJumpElapsed += dt;
    const progress = THREE.MathUtils.clamp(this.superJumpElapsed / duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);

    this.position.lerpVectors(this.superJumpFrom, this.superJumpTo, eased);
    this.resolveBarrierCollision();
    const groundY = this.world.getHeightAt(this.position.x, this.position.z) + this.groundOffset + this.groundClearance;
    this.position.y = groundY + Math.sin(progress * Math.PI) * height;
    this.group.position.copy(this.position);
    return progress < 1;
  }

  startChargeShot() {
    this.setAiState("chargeShot", this.getEnemyValue("chargeShotTime", 0.45));
  }

  startSpecialCharge(kind) {
    this.pendingSpecial = kind ?? this.typeId;
    this.specialEnergy = Math.max(0, this.specialEnergy - this.specialCost);
    this.specialCooldownTimer = this.getEnemyValue("specialCooldown", 7);
    this.guardActive = false;
    this.setAiState("specialCharge", this.getEnemyValue("specialChargeTime", 0.85));
  }

  canUseSpecial(distance, attackMinDistance, attackMaxDistance) {
    return this.specialCooldownTimer <= 0
      && this.specialEnergy >= this.specialCost
      && distance >= attackMinDistance
      && distance <= attackMaxDistance + this.getEnemyValue("specialRangeBonus", 8);
  }

  getSpecialStatus() {
    return {
      energy: this.specialEnergy,
      maxEnergy: this.specialEnergyMax,
      fillRate: this.specialEnergyMax > 0 ? this.specialEnergy / this.specialEnergyMax : 0,
      ready: this.specialEnergy >= this.specialCost && this.specialCooldownTimer <= 0
    };
  }

  getShieldStatus() {
    if (this.typeId !== "guard" || this.shieldMax <= 0) return null;
    return {
      durability: this.shieldDurability,
      maxDurability: this.shieldMax,
      fillRate: this.shieldMax > 0 ? this.shieldDurability / this.shieldMax : 0,
      broken: this.shieldDurability <= 0
    };
  }

  fireSlash(skills, player) {
    const enemyConfig = this.config.enemy;
    skills.slashFrom(this, player, {
      team: this.projectileTeam ?? "enemy",
      owner: this,
      color: this.typeId === "slash" ? 0x8b5cf6 : 0x9ff8ff,
      damage: this.typeConfig.slashDamage ?? enemyConfig.slashDamage,
      speed: this.typeConfig.slashSpeed ?? enemyConfig.slashSpeed,
      lifetime: this.typeConfig.slashLifetime ?? enemyConfig.slashLifetime,
      maxDistance: this.typeConfig.slashMaxDistance ?? enemyConfig.slashMaxDistance,
      hitRadius: this.typeConfig.slashHitRadius ?? enemyConfig.slashHitRadius
    });
    this.shootTimer = this.getShootInterval();
  }

  fireRapidShot(skills, player) {
    skills.projectileAt(this, player, this.projectileTeam ?? "enemy", 0xff3b30, {
      shape: "bolt",
      owner: this,
      width: 0.14,
      height: 0.14,
      length: 1.45,
      originHeight: this.getEnemyValue("attackOriginHeight", 1.62),
      targetHeight: this.getEnemyValue("attackTargetHeight", 1.35),
      verticalAimScale: this.getEnemyValue("attackVerticalAimScale", 0.34),
      damage: this.getEnemyValue("attackDamage", 14),
      speed: this.getEnemyValue("attackSpeed", 56),
      lifetime: this.getEnemyValue("attackLifetime", 1.8),
      hitRadius: this.getEnemyValue("attackHitRadius", 0.4)
    });
    this.shootTimer = this.getShootInterval();
  }

  fireCrossShot(skills, player) {
    skills.crossShotAt(this, player, {
      team: this.projectileTeam ?? "enemy",
      owner: this,
      color: 0xe9feff,
      damage: this.getEnemyValue("attackDamage", 15),
      speed: this.getEnemyValue("attackSpeed", 38),
      lifetime: this.getEnemyValue("attackLifetime", 2.4),
      hitRadius: this.getEnemyValue("attackHitRadius", 0.68),
      length: this.getEnemyValue("crossLength", 1.7),
      width: this.getEnemyValue("crossWidth", 0.16),
      originHeight: this.getEnemyValue("attackOriginHeight", 1.65),
      targetHeight: this.getEnemyValue("attackTargetHeight", 1.35)
    });
    this.shootTimer = this.getShootInterval();
  }

  fireNormalAttack(skills, player) {
    if (this.typeId === "rapid") {
      this.fireRapidShot(skills, player);
      return;
    }

    if (this.typeId === "guard") {
      this.fireCrossShot(skills, player);
      return;
    }

    this.fireSlash(skills, player);
  }

  startRapidRocketVolley() {
    this.rocketVolleyRemaining = this.getEnemyValue("rocketCount", 6);
    this.rocketVolleyTimer = 0;
    this.setAiState("rocketVolley", this.getEnemyValue("rocketVolleyDuration", 1.15));
  }

  fireRocket(skills, player) {
    skills.projectileAt(this, player, this.projectileTeam ?? "enemy", 0xff7a1a, {
      radius: this.getEnemyValue("rocketRadius", 0.48),
      owner: this,
      originHeight: this.getEnemyValue("rocketOriginHeight", 1.72),
      targetHeight: this.getEnemyValue("rocketTargetHeight", 1.25),
      verticalAimScale: this.getEnemyValue("rocketVerticalAimScale", 0.28),
      damage: this.getEnemyValue("rocketDamage", 16),
      speed: this.getEnemyValue("rocketSpeed", 30),
      lifetime: this.getEnemyValue("rocketLifetime", 2.8),
      hitRadius: this.getEnemyValue("rocketHitRadius", 0.72),
      explosionRadius: this.getEnemyValue("rocketExplosionRadius", 3.1),
      explosionDamage: this.getEnemyValue("rocketExplosionDamage", 20),
      opacity: 0.94
    });
  }

  updateRocketVolley(dt, skills, player) {
    this.rocketVolleyTimer -= dt;
    if (this.rocketVolleyRemaining > 0 && this.rocketVolleyTimer <= 0) {
      this.fireRocket(skills, player);
      this.rocketVolleyRemaining -= 1;
      this.rocketVolleyTimer = this.getEnemyValue("rocketInterval", 0.18);
    }

    return this.rocketVolleyRemaining > 0 || this.rocketVolleyTimer > 0;
  }

  fireSpecial(skills, player, callbacks = {}) {
    if (this.pendingSpecial === "rapid") {
      this.pendingSpecial = null;
      this.startRapidRocketVolley();
      return;
    }

    if (this.pendingSpecial === "slash") {
      this.pendingSpecial = null;
      skills.slashFrom(this, player, {
        team: this.projectileTeam ?? "enemy",
        owner: this,
        color: 0xb084ff,
        opacity: 0.78,
        damage: this.getEnemyValue("specialSlashDamage", 34),
        speed: this.getEnemyValue("specialSlashSpeed", 30),
        lifetime: this.getEnemyValue("specialSlashLifetime", 2.2),
        maxDistance: this.getEnemyValue("specialSlashMaxDistance", 34),
        hitRadius: this.getEnemyValue("specialSlashHitRadius", 3.2),
        visualScale: this.getEnemyValue("specialSlashVisualScale", 3.2),
        originHeight: this.getEnemyValue("slashOriginHeight", 1.55),
        targetHeight: this.getEnemyValue("slashTargetHeight", 1.2)
      });
      this.setAiState("recovery", this.getEnemyValue("specialRecovery", 0.75));
      return;
    }

    if (this.pendingSpecial === "guard") {
      this.pendingSpecial = null;
      skills.beamFrom(this, player, {
        team: this.projectileTeam ?? "enemy",
        owner: this,
        color: 0x9ff8ff,
        range: this.getEnemyValue("beamRange", 78),
        width: this.getEnemyValue("beamWidth", 0.62),
        damage: this.getEnemyValue("beamDamage", 36),
        duration: this.getEnemyValue("beamDuration", 2),
        hitRadius: this.getEnemyValue("beamHitRadius", 1.05),
        originHeight: this.getEnemyValue("beamOriginHeight", 1.75),
        targetHeight: this.getEnemyValue("beamTargetHeight", 1.35)
      }, callbacks);
      this.setAiState("recovery", this.getEnemyValue("specialRecovery", 0.85));
    }
  }

  updateChargePose() {
    const pulse = 1 + Math.sin(performance.now() * 0.018) * 0.08;
    this.chestCore.scale.setScalar(1.28 * pulse);
    this.faceRing.scale.setScalar(1.18 * pulse);
    this.bodyRig.rotation.x -= 0.08;
  }

  updateEnemy(dt, player, skills, callbacks = {}) {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const yaw = Math.atan2(dx, dz);
    this.group.rotation.y = yaw;
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    this.stateTimer = Math.max(0, this.stateTimer - dt);
    this.dodgeCooldownTimer = Math.max(0, this.dodgeCooldownTimer - dt);
    this.guardCooldownTimer = Math.max(0, this.guardCooldownTimer - dt);
    this.superJumpCooldownTimer = Math.max(0, this.superJumpCooldownTimer - dt);
    this.specialCooldownTimer = Math.max(0, this.specialCooldownTimer - dt);
    this.specialEnergy = Math.min(this.specialEnergyMax, this.specialEnergy + this.specialEnergyRegen * dt);
    this.updateShieldRegen(dt);

    let moving = false;
    let chargePose = false;
    const enemyConfig = this.config.enemy;
    const attackMinDistance = this.typeConfig.attackMinDistance ?? enemyConfig.attackMinDistance;
    const attackMaxDistance = this.typeConfig.attackMaxDistance ?? enemyConfig.attackMaxDistance;
    const retreatSpeed = this.typeConfig.retreatSpeed ?? enemyConfig.retreatSpeed;
    const chaseSpeed = this.typeConfig.chaseSpeed ?? enemyConfig.chaseSpeed;
    const spacingSpeed = this.typeConfig.spacingSpeed ?? enemyConfig.spacingSpeed;

    if (this.aiState === "dodge") {
      moving = this.runDodge(dt);
      if (this.stateTimer <= 0) this.setAiState("recovery", this.getEnemyValue("recoveryTime", 0.35));
    } else if (this.aiState === "rocketVolley") {
      chargePose = true;
      if (!this.updateRocketVolley(dt, skills, player)) {
        this.setAiState("recovery", this.getEnemyValue("specialRecovery", 0.65));
        chargePose = false;
      }
    } else if (this.aiState === "superJump") {
      moving = this.runSuperJump(dt);
      if (!moving) {
        this.keepOnGround();
        this.group.position.copy(this.position);
        this.setAiState("recovery", this.getEnemyValue("recoveryTime", 0.35));
      }
    } else if (this.aiState === "guard") {
      if (this.stateTimer <= 0) {
        this.guardActive = false;
        this.setAiState("recovery", this.getEnemyValue("recoveryTime", 0.35));
      }
    } else if (this.aiState === "chargeShot") {
      chargePose = true;
      if (this.stateTimer <= 0) {
        this.fireNormalAttack(skills, player);
        this.setAiState("recovery", this.getEnemyValue("attackRecovery", 0.35));
        chargePose = false;
      }
    } else if (this.aiState === "specialCharge") {
      chargePose = true;
      if (this.stateTimer <= 0) {
        this.fireSpecial(skills, player, callbacks);
        if (this.aiState === "specialCharge") {
          this.setAiState("recovery", this.getEnemyValue("specialRecovery", this.getEnemyValue("attackRecovery", 0.35)));
          chargePose = false;
        }
      }
    } else if (this.aiState === "recovery") {
      if (this.stateTimer <= 0) this.setAiState("keepDistance");
    } else {
      const threat = this.findThreateningProjectile(skills);
      const canSuperJump = distance < enemyConfig.retreatDistance + 1 && this.superJumpCooldownTimer <= 0;
      const coverPoint = threat ? this.findCoverPoint(player, threat) : null;

      if (canSuperJump) {
        this.startSuperJump(player);
      } else if (
        threat
        && coverPoint
        && this.dodgeCooldownTimer <= 0
        && Math.random() < this.getEnemyValue("coverChance", 0.42)
      ) {
        this.startCoverDodge(coverPoint);
      } else if (threat && this.dodgeCooldownTimer <= 0 && Math.random() < this.getEnemyValue("dodgeChance", 0.32)) {
        this.startDodge(threat);
      } else if (threat && this.guardCooldownTimer <= 0 && Math.random() < this.getEnemyValue("guardChance", 0.25)) {
        this.startGuard();
      } else if (distance < attackMinDistance) {
        this.setAiState("keepDistance");
        const speed = distance < enemyConfig.retreatDistance ? retreatSpeed : spacingSpeed;
        moving = this.moveToward(player, speed, dt, true);
      } else if (distance > attackMaxDistance) {
        this.setAiState("keepDistance");
        moving = this.moveToward(player, chaseSpeed, dt);
      } else if (
        this.canUseSpecial(distance, attackMinDistance, attackMaxDistance)
        && Math.random() < this.getEnemyValue("specialUseChance", 0.72)
      ) {
        this.startSpecialCharge(this.typeId);
        chargePose = true;
      } else if (this.shootTimer <= 0) {
        this.startChargeShot();
        chargePose = true;
      } else {
        this.setAiState("strafe");
        moving = this.strafeAround(player, dt, distance, attackMinDistance, attackMaxDistance);
      }
    }

    this.updateGuardEffect();
    this.updateAnimation(moving, false);
    if (chargePose) this.updateChargePose();
    this.updateHealthBar();
  }
}

export class EnemyManager {
  constructor(scene, config, world) {
    this.scene = scene;
    this.config = config;
    this.world = world;
    this.enemies = config.enemy.types.map((typeConfig, index) => new Enemy(scene, config, world, typeConfig, index));
    this.activeIndex = 0;
    this.nextSpawnTimer = 0;
    this.enemies.forEach((enemy) => {
      enemy.group.visible = false;
      enemy.hp = 0;
    });
  }

  spawnFarFrom(playerPosition, typeConfig, index) {
    const minDistance = typeConfig.spawnMinDistance ?? this.config.enemy.spawnMinDistance;
    const maxDistance = typeConfig.spawnMaxDistance ?? this.config.enemy.spawnMaxDistance;
    const angle = (Math.PI * 2 * index) / Math.max(1, this.enemies.length) + Math.random() * 0.7;
    const distance = minDistance + Math.random() * (maxDistance - minDistance);
    return {
      x: playerPosition.x + Math.sin(angle) * distance,
      z: playerPosition.z + Math.cos(angle) * distance
    };
  }

  start(playerPosition) {
    this.activeIndex = 0;
    this.nextSpawnTimer = 0;
    this.enemies.forEach((enemy) => {
      enemy.group.visible = false;
      enemy.hp = 0;
    });
    this.spawnActiveEnemy(playerPosition);
  }

  spawnActiveEnemy(playerPosition) {
    const enemy = this.getActiveEnemy();
    const spawn = this.spawnFarFrom(playerPosition, enemy.typeConfig, enemy.index);
    enemy.resetAt(spawn.x, spawn.z);
  }

  getActiveEnemy() {
    return this.enemies[this.activeIndex];
  }

  update(dt, player, skills, callbacks = {}) {
    const activeEnemy = this.getActiveEnemy();
    if (activeEnemy.hp <= 0) {
      activeEnemy.group.visible = false;
      this.nextSpawnTimer -= dt;
      if (this.nextSpawnTimer <= 0) {
        this.activeIndex = (this.activeIndex + 1) % this.enemies.length;
        this.spawnActiveEnemy(player.position);
      }
      return;
    }

    activeEnemy.updateEnemy(dt, player, skills, callbacks);
  }

  handleEnemyDeath(enemy) {
    enemy.group.visible = false;
    this.nextSpawnTimer = this.config.enemy.respawnDelay;
  }

  getAliveEnemies() {
    const activeEnemy = this.getActiveEnemy();
    return activeEnemy && activeEnemy.hp > 0 ? [activeEnemy] : [];
  }

  getDisplayEnemies() {
    return this.getAliveEnemies();
  }

  getAliveCount() {
    return this.getAliveEnemies().length;
  }

  stop() {
    this.enemies.forEach((enemy) => {
      enemy.group.visible = false;
      enemy.hp = 0;
    });
  }
}

export class BattleRoyaleManager {
  constructor(scene, config, world) {
    this.scene = scene;
    this.config = config;
    this.world = world;
    this.settings = config.battleRoyale;
    this.enemies = [];
    this.playerPosition = new THREE.Vector3();
    this.safeZoneCenter = new THREE.Vector3();
    this.safeZoneElapsed = 0;
    this.safeZoneRadius = this.settings.zoneStartRadius ?? 280;
    this.zoneDamageSource = { team: "zone", type: "zone", owner: null };
    this.createSafeZoneVisual();
    this.createBots();
  }

  createUnitCircleGeometry(y, segments) {
    const points = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.sin(angle), y, Math.cos(angle)));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  createPillarGeometry(height, segments) {
    const points = [];
    const pillarCount = Math.max(24, Math.floor(segments / 3));
    for (let i = 0; i < pillarCount; i++) {
      const angle = (i / pillarCount) * Math.PI * 2;
      const x = Math.sin(angle);
      const z = Math.cos(angle);
      points.push(new THREE.Vector3(x, 0.18, z), new THREE.Vector3(x, height, z));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  createSafeZoneVisual() {
    const segments = this.config.performance?.lowPower ? 96 : 144;
    const height = this.settings.zoneBoundaryHeight ?? 8;
    this.safeZoneRingMaterial = new THREE.LineBasicMaterial({
      color: 0xff9f1c,
      transparent: true,
      opacity: 1
    });
    this.safeZoneTopMaterial = new THREE.LineBasicMaterial({
      color: 0xffc36b,
      transparent: true,
      opacity: 0.74
    });
    this.safeZonePillarMaterial = new THREE.LineBasicMaterial({
      color: 0xff7a1a,
      transparent: true,
      opacity: 0.62
    });
    this.safeZoneBandMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8c1a,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.safeZoneWallMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6b1a,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.safeZoneGroup = new THREE.Group();
    this.safeZoneGroundBand = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.015, segments), this.safeZoneBandMaterial);
    this.safeZoneGroundBand.rotation.x = -Math.PI / 2;
    this.safeZoneGroundBand.position.y = 0.2;
    this.safeZoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, height, segments, 1, true), this.safeZoneWallMaterial);
    this.safeZoneWall.position.y = height / 2;
    this.safeZoneGroundRing = new THREE.LineLoop(this.createUnitCircleGeometry(0.18, segments), this.safeZoneRingMaterial);
    this.safeZoneTopRing = new THREE.LineLoop(this.createUnitCircleGeometry(height, segments), this.safeZoneTopMaterial);
    this.safeZonePillars = new THREE.LineSegments(this.createPillarGeometry(height, segments), this.safeZonePillarMaterial);
    this.safeZoneGroup.add(
      this.safeZoneWall,
      this.safeZoneGroundBand,
      this.safeZoneGroundRing,
      this.safeZoneTopRing,
      this.safeZonePillars
    );
    this.safeZoneGroup.visible = false;
    this.scene.add(this.safeZoneGroup);
  }

  getSafeZoneProgress() {
    const delay = this.settings.zoneShrinkDelay ?? 12;
    const duration = Math.max(1, this.settings.zoneShrinkDuration ?? 180);
    return THREE.MathUtils.clamp((this.safeZoneElapsed - delay) / duration, 0, 1);
  }

  getSafeZoneRadius() {
    const startRadius = this.settings.zoneStartRadius ?? 280;
    const endRadius = this.settings.zoneEndRadius ?? 44;
    return THREE.MathUtils.lerp(startRadius, endRadius, this.getSafeZoneProgress());
  }

  getZoneDamagePerSecond() {
    return THREE.MathUtils.lerp(
      this.settings.zoneDamagePerSecond ?? 5,
      this.settings.zoneFinalDamagePerSecond ?? 14,
      this.getSafeZoneProgress()
    );
  }

  isOutsideSafeZone(position) {
    const dx = position.x - this.safeZoneCenter.x;
    const dz = position.z - this.safeZoneCenter.z;
    return dx * dx + dz * dz > this.safeZoneRadius * this.safeZoneRadius;
  }

  distanceFromSafeZoneCenter(position) {
    const dx = position.x - this.safeZoneCenter.x;
    const dz = position.z - this.safeZoneCenter.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  updateSafeZoneVisual(player) {
    if (!this.safeZoneGroup) return;

    const centerY = this.world.getHeightAt(this.safeZoneCenter.x, this.safeZoneCenter.z);
    const playerOutside = player.hp > 0 && this.isOutsideSafeZone(player.position);
    const color = playerOutside ? 0xff4d1a : 0xff9f1c;
    this.safeZoneRingMaterial.color.setHex(color);
    this.safeZoneTopMaterial.color.setHex(playerOutside ? 0xffb04a : 0xffc36b);
    this.safeZonePillarMaterial.color.setHex(color);
    this.safeZoneBandMaterial.color.setHex(playerOutside ? 0xff5c1a : 0xff8c1a);
    this.safeZoneWallMaterial.color.setHex(playerOutside ? 0xff3d14 : 0xff6b1a);
    this.safeZoneRingMaterial.opacity = 1;
    this.safeZoneTopMaterial.opacity = playerOutside ? 0.86 : 0.74;
    this.safeZonePillarMaterial.opacity = playerOutside ? 0.82 : 0.62;
    this.safeZoneBandMaterial.opacity = playerOutside ? 0.58 : 0.42;
    this.safeZoneWallMaterial.opacity = playerOutside ? 0.22 : 0.13;
    this.safeZoneGroup.position.set(this.safeZoneCenter.x, centerY, this.safeZoneCenter.z);
    this.safeZoneGroup.scale.set(this.safeZoneRadius, 1, this.safeZoneRadius);
    this.safeZoneGroup.visible = true;
  }

  applySafeZoneDamage(dt, target, player, callbacks = {}) {
    if (!target || target.hp <= 0) return;
    if (!this.isOutsideSafeZone(target.position)) {
      target.zoneDamageCarry = 0;
      return;
    }

    target.zoneDamageCarry = (target.zoneDamageCarry ?? 0) + this.getZoneDamagePerSecond() * dt;
    const damage = Math.floor(target.zoneDamageCarry);
    if (damage <= 0) return;

    target.zoneDamageCarry -= damage;
    if (target.takeDamage(damage, this.zoneDamageSource)) {
      if (target === player) callbacks.onPlayerDeath?.(this.zoneDamageSource);
      else callbacks.onEnemyDeath?.(target, this.zoneDamageSource);
    }
  }

  updateSafeZone(dt, player, aliveBots, callbacks = {}) {
    this.safeZoneElapsed += dt;
    this.safeZoneRadius = this.getSafeZoneRadius();
    this.updateSafeZoneVisual(player);
    this.applySafeZoneDamage(dt, player, player, callbacks);
    for (const bot of aliveBots) {
      this.applySafeZoneDamage(dt, bot, player, callbacks);
    }
  }

  createBots() {
    const types = this.config.enemy.types;
    const botCount = this.settings.botCount ?? 99;
    for (let i = 0; i < botCount; i++) {
      const typeConfig = types[i % types.length];
      const bot = new Enemy(this.scene, this.config, this.world, typeConfig, i);
      bot.displayName = `${typeConfig.name}-${i + 1}`;
      bot.team = "enemy";
      bot.projectileTeam = "bot";
      bot.group.userData.team = "enemy";
      bot.group.visible = false;
      bot.hp = 0;
      bot.targetSwitchTimer = Math.random() * (this.settings.targetSwitchInterval ?? 1.4);
      bot.simpleCombatTimer = Math.random() * (this.settings.simpleCombatInterval ?? 1.2);
      this.enemies.push(bot);
    }
  }

  start(playerPosition) {
    this.playerPosition.copy(playerPosition);
    this.safeZoneCenter.set(playerPosition.x, 0, playerPosition.z);
    this.safeZoneElapsed = 0;
    this.safeZoneRadius = this.getSafeZoneRadius();
    this.safeZoneGroup.visible = true;
    const positions = [];
    const minRadius = this.settings.spawnRadiusMin ?? 90;
    const maxRadius = this.settings.spawnRadiusMax ?? 260;
    const minSpacing = this.settings.minBotSpacing ?? 9;

    this.enemies.forEach((bot, index) => {
      let spawn = null;
      for (let attempt = 0; attempt < 50; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = minRadius + Math.random() * (maxRadius - minRadius);
        const candidate = new THREE.Vector3(
          playerPosition.x + Math.sin(angle) * radius,
          0,
          playerPosition.z + Math.cos(angle) * radius
        );
        const spaced = positions.every((position) => position.distanceTo(candidate) >= minSpacing);
        if (spaced) {
          spawn = candidate;
          break;
        }
      }

      if (!spawn) {
        const angle = (Math.PI * 2 * index) / Math.max(1, this.enemies.length);
        const radius = minRadius + (index % 9) * minSpacing;
        spawn = new THREE.Vector3(
          playerPosition.x + Math.sin(angle) * radius,
          0,
          playerPosition.z + Math.cos(angle) * radius
        );
      }

      positions.push(spawn);
      bot.resetAt(spawn.x, spawn.z);
      bot.projectileTeam = "bot";
      bot.group.visible = false;
      bot.currentTarget = null;
      bot.zoneDamageCarry = 0;
      bot.targetSwitchTimer = Math.random() * (this.settings.targetSwitchInterval ?? 1.4);
      bot.simpleCombatTimer = Math.random() * (this.settings.simpleCombatInterval ?? 1.2);
    });
    this.updateSafeZoneVisual({ hp: 1, position: playerPosition });
  }

  stop() {
    this.safeZoneGroup.visible = false;
    this.enemies.forEach((bot) => {
      bot.group.visible = false;
      bot.hp = 0;
      bot.currentTarget = null;
      bot.zoneDamageCarry = 0;
    });
  }

  getAliveEnemies() {
    return this.enemies.filter((bot) => bot.hp > 0);
  }

  getAliveCount(player = null) {
    const playerAlive = !player || player.hp > 0 ? 1 : 0;
    return playerAlive + this.getAliveEnemies().length;
  }

  getActiveEnemy() {
    const alive = this.getAliveEnemies();
    if (alive.length === 0) return null;
    return alive
      .slice()
      .sort((a, b) => a.position.distanceToSquared(this.playerPosition) - b.position.distanceToSquared(this.playerPosition))[0];
  }

  getDisplayEnemies() {
    const count = this.settings.hudEnemyCount ?? 3;
    return this.getAliveEnemies()
      .slice()
      .sort((a, b) => a.position.distanceToSquared(this.playerPosition) - b.position.distanceToSquared(this.playerPosition))
      .slice(0, count);
  }

  getPerformanceSetting(name, fallback) {
    const lowPowerKey = `lowPower${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    if (this.config.performance?.lowPower && this.settings[lowPowerKey] !== undefined) {
      return this.settings[lowPowerKey];
    }
    return this.settings[name] ?? fallback;
  }

  findNearestTarget(bot, player, aliveBots, radius = Infinity) {
    let best = null;
    let bestDistanceSq = radius * radius;

    if (player.hp > 0) {
      const playerDistanceSq = bot.position.distanceToSquared(player.position);
      if (playerDistanceSq < bestDistanceSq) {
        best = player;
        bestDistanceSq = playerDistanceSq;
      }
    }

    if (this.settings.friendlyFire !== false) {
      for (const other of aliveBots) {
        if (other === bot || other.hp <= 0) continue;
        const distanceSq = bot.position.distanceToSquared(other.position);
        if (distanceSq < bestDistanceSq) {
          best = other;
          bestDistanceSq = distanceSq;
        }
      }
    }

    return best;
  }

  updateVisibility(bot, player, distanceSq = null) {
    const visibleDistance = this.getPerformanceSetting("visibleDistance", 160);
    const playerDistanceSq = distanceSq ?? bot.position.distanceToSquared(player.position);
    bot.group.visible = bot.hp > 0 && playerDistanceSq <= visibleDistance * visibleDistance;
  }

  runSimpleBot(dt, bot, player, aliveBots, callbacks = {}) {
    const interval = this.getPerformanceSetting("simpleCombatInterval", 1.2);
    bot.simpleCombatTimer -= dt;
    if (bot.simpleCombatTimer > 0) return;
    bot.simpleCombatTimer = interval + Math.random() * interval * 0.8;

    const target = this.findNearestTarget(bot, player, aliveBots, this.settings.targetSearchRadius ?? 95);
    if (!target) return;

    const toTarget = new THREE.Vector3(target.position.x - bot.position.x, 0, target.position.z - bot.position.z);
    const distance = toTarget.length();
    if (distance > (bot.typeConfig.attackMaxDistance ?? this.config.enemy.attackMaxDistance)) {
      toTarget.normalize();
      const speed = this.settings.simpleMoveSpeed ?? 4.2;
      bot.position.addScaledVector(toTarget, speed * interval);
      bot.resolveBarrierCollision();
      bot.keepOnGround();
      bot.group.position.copy(bot.position);
      return;
    }

    const minDamage = this.settings.simpleCombatDamageMin ?? 5;
    const maxDamage = this.settings.simpleCombatDamageMax ?? 14;
    const damage = Math.round(minDamage + Math.random() * (maxDamage - minDamage));
    const source = { team: "bot", owner: bot, type: "abstract" };
    if (target.takeDamage(damage, source)) {
      if (target === player) callbacks.onPlayerDeath?.(source);
      else callbacks.onEnemyDeath?.(target, source);
    }
  }

  shouldRetreatToSafeZone(bot) {
    if (!bot || bot.hp <= 0) return false;
    const margin = this.settings.zoneAiRetreatMargin ?? 32;
    return this.distanceFromSafeZoneCenter(bot.position) >= this.safeZoneRadius - margin;
  }

  runSafeZoneRetreat(dt, bot) {
    const toCenter = new THREE.Vector3(
      this.safeZoneCenter.x - bot.position.x,
      0,
      this.safeZoneCenter.z - bot.position.z
    );
    if (toCenter.lengthSq() <= 1) return false;

    const speed = this.settings.zoneAiRetreatSpeed ?? 10;
    const yaw = Math.atan2(toCenter.x, toCenter.z);
    bot.guardActive = false;
    bot.coverTarget = null;
    bot.currentTarget = null;
    bot.group.rotation.y = yaw;
    bot.moveByVector(toCenter.normalize().multiplyScalar(speed), dt);
    bot.updateGuardEffect?.();
    bot.updateAnimation?.(true, false);
    bot.updateHealthBar?.();
    return true;
  }

  update(dt, player, skills, callbacks = {}) {
    this.playerPosition.copy(player.position);
    let aliveBots = this.getAliveEnemies();
    this.updateSafeZone(dt, player, aliveBots, callbacks);
    if (player.hp <= 0) return;

    aliveBots = this.getAliveEnemies();
    if (aliveBots.length === 0 && player.hp > 0) {
      callbacks.onVictory?.();
      return;
    }

    const activeDistance = this.getPerformanceSetting("activeDistance", 86);
    const maxActive = this.getPerformanceSetting("maxActiveAttackers", 18);
    const activeDistanceSq = activeDistance * activeDistance;
    const botDistances = aliveBots.map((bot) => ({
      bot,
      distanceSq: bot.position.distanceToSquared(player.position)
    }));
    const activeBots = botDistances
      .filter(({ distanceSq }) => distanceSq <= activeDistanceSq)
      .sort((a, b) => a.distanceSq - b.distanceSq)
      .slice(0, maxActive);
    const activeSet = new Set(activeBots.map(({ bot }) => bot));

    for (const { bot, distanceSq } of botDistances) {
      this.updateVisibility(bot, player, distanceSq);
      if (this.shouldRetreatToSafeZone(bot)) {
        this.runSafeZoneRetreat(dt, bot);
        continue;
      }

      if (activeSet.has(bot)) {
        bot.targetSwitchTimer -= dt;
        if (!bot.currentTarget || bot.currentTarget.hp <= 0 || bot.targetSwitchTimer <= 0) {
          bot.currentTarget = this.findNearestTarget(bot, player, aliveBots, this.settings.targetSearchRadius ?? 95) ?? player;
          bot.targetSwitchTimer = this.settings.targetSwitchInterval ?? 1.4;
        }
        bot.updateEnemy(dt, bot.currentTarget, skills, callbacks);
      } else {
        this.runSimpleBot(dt, bot, player, aliveBots, callbacks);
      }
    }
  }

  handleEnemyDeath(enemy) {
    enemy.group.visible = false;
    enemy.hp = 0;
    enemy.currentTarget = null;
  }
}
