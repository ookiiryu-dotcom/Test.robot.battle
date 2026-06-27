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
    this.group.userData.team = "enemy";
    this.applyEnemyLook();
  }

  getShootInterval() {
    return this.typeConfig.slashCooldown ?? this.config.enemy.slashCooldown ?? this.config.enemy.shootInterval;
  }

  applyEnemyLook() {
    const baseColor = new THREE.Color(this.typeConfig.color ?? "#ff6b6b");
    this.group.traverse((child) => {
      if (child.isMesh && child.material?.color) {
        const material = child.material.clone();
        material.color.lerpColors(material.color, baseColor, 0.62);
        child.material = material;
      }
    });
    if (this.typeId === "mid") {
      this.bodyRig.scale.x *= 1.03;
      this.bodyRig.scale.z *= 1.03;
    }

    if (this.typeId === "far") {
      this.bodyRig.scale.x *= 0.86;
      this.bodyRig.scale.y *= 1.14;
      this.faceRing.scale.x *= 1.35;
    }
  }

  resetAt(x, z) {
    this.setPosition(x, z);
    this.restoreHp();
    this.shootTimer = this.getShootInterval();
    this.respawnTimer = 0;
    this.group.visible = true;
  }

  moveToward(player, speed, dt, retreat = false) {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const move = new THREE.Vector3(dx, 0, dz);
    if (move.lengthSq() === 0) return false;

    move.normalize();
    if (retreat) move.multiplyScalar(-1);
    this.position.x += move.x * speed * dt;
    this.position.z += move.z * speed * dt;
    this.resolveBarrierCollision();
    this.position.y = this.world.getHeightAt(this.position.x, this.position.z) + this.groundOffset + this.groundClearance;
    this.group.position.copy(this.position);
    return true;
  }

  updateEnemy(dt, player, skills, callbacks = {}) {
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const yaw = Math.atan2(dx, dz);
    this.group.rotation.y = yaw;
    this.shootTimer = Math.max(0, this.shootTimer - dt);

    let moving = false;
    const enemyConfig = this.config.enemy;
    const attackMinDistance = this.typeConfig.attackMinDistance ?? enemyConfig.attackMinDistance;
    const attackMaxDistance = this.typeConfig.attackMaxDistance ?? enemyConfig.attackMaxDistance;
    const retreatSpeed = this.typeConfig.retreatSpeed ?? enemyConfig.retreatSpeed;
    const chaseSpeed = this.typeConfig.chaseSpeed ?? enemyConfig.chaseSpeed;
    const spacingSpeed = this.typeConfig.spacingSpeed ?? enemyConfig.spacingSpeed;

    if (distance < attackMinDistance) {
      const speed = distance < enemyConfig.retreatDistance ? retreatSpeed : spacingSpeed;
      moving = this.moveToward(player, speed, dt, true);
    } else if (distance > attackMaxDistance) {
      moving = this.moveToward(player, chaseSpeed, dt);
    } else if (this.shootTimer <= 0) {
      skills.slashFrom(this, player, {
        damage: this.typeConfig.slashDamage ?? enemyConfig.slashDamage,
        speed: this.typeConfig.slashSpeed ?? enemyConfig.slashSpeed,
        lifetime: this.typeConfig.slashLifetime ?? enemyConfig.slashLifetime,
        maxDistance: this.typeConfig.slashMaxDistance ?? enemyConfig.slashMaxDistance,
        hitRadius: this.typeConfig.slashHitRadius ?? enemyConfig.slashHitRadius
      });
      this.shootTimer = this.getShootInterval();
    }

    this.updateAnimation(moving, false);
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
}
