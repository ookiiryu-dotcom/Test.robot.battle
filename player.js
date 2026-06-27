import * as THREE from "three";

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export class Player {
  constructor(scene, config, world) {
    this.scene = scene;
    this.config = config;
    this.world = world;
    this.maxHp = config.player.maxHp;
    this.hp = this.maxHp;
    this.position = new THREE.Vector3(0, 3, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.radius = config.player.radius;
    this.groundOffset = config.player.groundOffset;
    this.groundClearance = config.player.groundClearance;
    this.walkSpeed = config.player.walkSpeed;
    this.sprintSpeed = config.player.sprintSpeed;
    this.flySpeed = config.player.flySpeed;
    this.jumpPower = config.player.jumpPower;
    this.gravity = config.player.gravity;
    this.onGround = false;
    this.flyMode = false;
    this.ascendTimer = 0;
    this.ascendSpeed = 0;
    this.ascendEnergyMax = config.player.ascendEnergyMax ?? 100;
    this.ascendEnergy = this.ascendEnergyMax;
    this.ascendEnergyDrain = config.player.ascendEnergyDrain ?? 34;
    this.ascendEnergyRegen = config.player.ascendEnergyRegen ?? 24;
    this.ascendMinToUse = config.player.ascendMinToUse ?? 1;
    this.isAscending = false;
    this.ascendExhausted = false;
    this.jumpWasPressed = false;
    this.shieldActive = false;
    this.team = "player";
    this.facingYaw = 0;
    this.characterId = "runner";
    this.characterConfig = null;
    this.specialEnergyMax = config.player.specialEnergyMax ?? 100;
    this.specialEnergy = this.specialEnergyMax;
    this.specialEnergyRegen = config.player.specialEnergyRegen ?? 12;
    this.specialCost = config.player.specialCost ?? 100;
    this.specialCooldown = config.player.specialCooldown ?? 8;
    this.specialCooldownTimer = 0;
    this.attackType = "shot";
    this.defenseType = "placedShield";
    this.specialType = "mine";
    this.defenseCooldownTimer = 0;
    this.dodgeTimer = 0;
    this.dodgeDirection = new THREE.Vector3();
    this.guardDefenseTimer = 0;
    this.guardShieldMax = 0;
    this.guardShieldDurability = 0;
    this.guardShieldRegen = 0;
    this.guardShieldRegenDelay = 0;
    this.guardShieldBrokenTimer = 0;

    this.group = new THREE.Group();
    this.bodyRig = new THREE.Group();
    this.baseRigScale = config.player.rigScale;
    this.bodyRig.scale.setScalar(this.baseRigScale);
    this.group.add(this.bodyRig);

    this.createRobotModel();
    this.scene.add(this.group);
    this.setCharacter(this.characterId);
  }

  createRobotModel() {
    const crystalMaterial = new THREE.MeshBasicMaterial({
      color: 0x8ff7ff,
      side: THREE.DoubleSide
    });

    const darkCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0x147c9f,
      side: THREE.DoubleSide
    });

    const armorMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9feff,
      side: THREE.DoubleSide
    });

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.98
    });

    const characterOutlineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88
    });

    const addMesh = (parent, mesh, position, rotation = null, scale = null) => {
      mesh.position.copy(position);
      if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
      if (scale) mesh.scale.copy(scale);
      mesh.castShadow = true;
      mesh.receiveShadow = false;

      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), characterOutlineMaterial);
      outline.renderOrder = 5;
      mesh.add(outline);

      parent.add(mesh);
      return mesh;
    };

    this.torso = addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.18, 0.5), armorMaterial),
      new THREE.Vector3(0, 0.34, 0),
      null,
      new THREE.Vector3(1, 1, 1)
    );

    this.waist = addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.28, 0.44), darkCoreMaterial),
      new THREE.Vector3(0, -0.42, 0)
    );

    this.shoulderBar = addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.28, 0.46), armorMaterial),
      new THREE.Vector3(0, 0.94, 0)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.24, 8), darkCoreMaterial),
      new THREE.Vector3(0, 1.2, 0)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.5), armorMaterial),
      new THREE.Vector3(0, 1.56, 0)
    );

    this.faceRing = addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.035), glowMaterial),
      new THREE.Vector3(0, 1.6, 0.27)
    );

    this.chestCore = addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.05), glowMaterial),
      new THREE.Vector3(0, 0.62, 0.32)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.1, 0.06), glowMaterial),
      new THREE.Vector3(0, 0.18, 0.32)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.06), darkCoreMaterial),
      new THREE.Vector3(-0.38, 0.36, 0.31)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.06), darkCoreMaterial),
      new THREE.Vector3(0.38, 0.36, 0.31)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.22, 0.08), glowMaterial),
      new THREE.Vector3(0, 0.3, -0.34)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), glowMaterial),
      new THREE.Vector3(0, 1.98, 0)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.08), glowMaterial),
      new THREE.Vector3(-0.22, 1.6, 0.29)
    );

    addMesh(
      this.bodyRig,
      new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.08), glowMaterial),
      new THREE.Vector3(0.22, 1.6, 0.29)
    );

    const upperArmGeometry = new THREE.BoxGeometry(0.24, 0.6, 0.28);
    const lowerArmGeometry = new THREE.BoxGeometry(0.22, 0.56, 0.24);
    const thighGeometry = new THREE.BoxGeometry(0.32, 0.64, 0.34);
    const shinGeometry = new THREE.BoxGeometry(0.28, 0.64, 0.3);
    const handGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.22);
    const footGeometry = new THREE.BoxGeometry(0.36, 0.18, 0.62);

    const createArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.78, 0.86, 0);
      this.bodyRig.add(shoulder);

      addMesh(shoulder, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), darkCoreMaterial), new THREE.Vector3(0, 0, 0));
      addMesh(
        shoulder,
        new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.5), glowMaterial),
        new THREE.Vector3(side * 0.12, 0.16, 0)
      );
      addMesh(
        shoulder,
        new THREE.Mesh(upperArmGeometry, crystalMaterial),
        new THREE.Vector3(side * 0.05, -0.34, 0),
        new THREE.Vector3(0, 0, side * 0.1)
      );
      addMesh(
        shoulder,
        new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.31), glowMaterial),
        new THREE.Vector3(side * 0.19, -0.34, 0.01)
      );

      const elbow = new THREE.Group();
      elbow.position.set(side * 0.08, -0.7, 0);
      shoulder.add(elbow);

      addMesh(elbow, new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.26), darkCoreMaterial), new THREE.Vector3(0, 0, 0));
      addMesh(
        elbow,
        new THREE.Mesh(lowerArmGeometry, crystalMaterial),
        new THREE.Vector3(side * 0.03, -0.3, 0.02),
        new THREE.Vector3(0, 0, side * 0.08)
      );
      addMesh(elbow, new THREE.Mesh(handGeometry, darkCoreMaterial), new THREE.Vector3(side * 0.04, -0.62, 0.04));

      return { shoulder, elbow };
    };

    const createLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.26, -0.46, 0);
      this.bodyRig.add(hip);

      addMesh(hip, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), darkCoreMaterial), new THREE.Vector3(0, 0, 0));
      addMesh(hip, new THREE.Mesh(thighGeometry, crystalMaterial), new THREE.Vector3(0, -0.36, 0), new THREE.Vector3(0, 0, side * 0.04));

      const knee = new THREE.Group();
      knee.position.set(0, -0.72, 0);
      hip.add(knee);

      addMesh(knee, new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28), darkCoreMaterial), new THREE.Vector3(0, 0, 0));
      addMesh(knee, new THREE.Mesh(shinGeometry, crystalMaterial), new THREE.Vector3(0, -0.38, 0.02), new THREE.Vector3(0, 0, -side * 0.03));
      addMesh(knee, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.34), glowMaterial), new THREE.Vector3(side * 0.13, -0.38, 0.03));
      const foot = addMesh(knee, new THREE.Mesh(footGeometry, darkCoreMaterial), new THREE.Vector3(0, -0.75, 0.18));

      return { hip, knee, foot };
    };

    this.leftArm = createArm(-1);
    this.rightArm = createArm(1);
    this.leftLeg = createLeg(-1);
    this.rightLeg = createLeg(1);
  }

  reset(yawPitchState) {
    const startY = this.world.getHeightAt(0, 0) + this.groundOffset + this.groundClearance;
    this.position.set(0, startY, 0);
    this.velocity.set(0, 0, 0);
    this.hp = this.maxHp;
    this.onGround = true;
    this.flyMode = false;
    this.ascendTimer = 0;
    this.ascendSpeed = 0;
    this.ascendEnergy = this.ascendEnergyMax;
    this.specialEnergy = this.specialEnergyMax;
    this.specialCooldownTimer = 0;
    this.isAscending = false;
    this.ascendExhausted = false;
    this.jumpWasPressed = false;
    this.shieldActive = false;
    this.defenseCooldownTimer = 0;
    this.dodgeTimer = 0;
    this.guardDefenseTimer = 0;
    this.guardShieldDurability = this.guardShieldMax;
    this.guardShieldBrokenTimer = 0;
    this.facingYaw = 0;
    this.group.rotation.y = this.facingYaw;
    yawPitchState.yaw = 0;
    yawPitchState.pitch = this.config.input.initialPitch;
  }

  getCharacterConfig(id) {
    const character = this.config.characters?.find((item) => item.id === id);
    const enemyType = this.config.enemy?.types?.find((item) => item.id === id);

    // Rapid/Slash/Guard are shared by enemies and the player. Merge enemy combat numbers first,
    // then let the player character entry override display and player-only values.
    if (character && enemyType) return { ...enemyType, ...character };
    return character ?? enemyType ?? this.config.characters?.[0] ?? null;
  }

  setCharacter(id) {
    const character = this.getCharacterConfig(id);
    if (!character || character.available === false) return;

    this.characterId = character.id;
    this.characterConfig = character;
    this.maxHp = character.playerMaxHp ?? character.maxHp ?? this.config.player.maxHp;
    this.hp = Math.min(this.hp, this.maxHp);
    this.attackType = character.attackType ?? this.inferAttackType(character.id);
    this.defenseType = character.defenseType ?? this.inferDefenseType(character.id);
    this.specialType = character.specialType ?? "mine";
    this.specialEnergyMax = character.specialEnergyMax ?? this.config.player.specialEnergyMax ?? 100;
    this.specialEnergyRegen = character.specialEnergyRegen ?? this.config.player.specialEnergyRegen ?? 12;
    this.specialCost = character.specialCost ?? this.config.player.specialCost ?? this.specialEnergyMax;
    this.specialCooldown = character.specialCooldown ?? this.config.player.specialCooldown ?? 8;
    this.specialEnergy = Math.min(this.specialEnergy, this.specialEnergyMax);
    const previousShieldRate = this.guardShieldMax > 0 ? this.guardShieldDurability / this.guardShieldMax : 1;
    this.guardShieldMax = character.shieldDurability ?? 0;
    this.guardShieldRegen = character.shieldRegen ?? this.config.enemy?.shieldRegen ?? 10;
    this.guardShieldRegenDelay = character.shieldRegenDelay ?? this.config.enemy?.shieldRegenDelay ?? 2.5;
    this.guardShieldDurability = this.guardShieldMax > 0 ? this.guardShieldMax * previousShieldRate : 0;
    this.applyCharacterVisual(character);
  }

  inferAttackType(id) {
    if (id === "rapid") return "rapid";
    if (id === "slash") return "slash";
    if (id === "guard") return "cross";
    return "shot";
  }

  inferDefenseType(id) {
    if (id === "rapid" || id === "slash") return "dodge";
    if (id === "guard") return "guardShield";
    return "placedShield";
  }

  applyCharacterVisual(character) {
    const tint = new THREE.Color(character.color ?? "#8ff7ff");
    const scale = this.baseRigScale * (character.playerScale ?? 1);
    this.bodyRig.scale.set(scale, scale, scale);

    this.group.traverse((child) => {
      if (!child.isMesh || !child.material?.color) return;
      const material = child.material.clone();
      material.color.lerp(tint, character.visualTint ?? 0.28);
      child.material = material;
    });
  }

  getCharacterValue(name, fallback) {
    return this.characterConfig?.[name] ?? fallback;
  }

  getSpecialValue(name, fallback) {
    return this.getCharacterValue(name, fallback);
  }

  getSpecialStatus() {
    const fillRate = this.specialEnergyMax > 0 ? this.specialEnergy / this.specialEnergyMax : 0;
    return {
      energy: this.specialEnergy,
      maxEnergy: this.specialEnergyMax,
      fillRate,
      ready: this.specialEnergy >= this.specialCost && this.specialCooldownTimer <= 0,
      type: this.specialType
    };
  }

  spendSpecial() {
    if (this.specialCooldownTimer > 0 || this.specialEnergy < this.specialCost) return false;
    this.specialEnergy = Math.max(0, this.specialEnergy - this.specialCost);
    this.specialCooldownTimer = this.specialCooldown;
    return true;
  }

  getDefenseStatus() {
    if (this.defenseType !== "guardShield" || this.guardShieldMax <= 0) return null;
    return {
      durability: this.guardShieldDurability,
      maxDurability: this.guardShieldMax,
      fillRate: this.guardShieldMax > 0 ? this.guardShieldDurability / this.guardShieldMax : 0,
      active: this.guardDefenseTimer > 0 && this.guardShieldDurability > 0,
      ready: this.guardShieldDurability > 0 && this.defenseCooldownTimer <= 0
    };
  }

  setPosition(x, z) {
    const y = this.world.getHeightAt(x, z) + this.groundOffset + this.groundClearance;
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.group.position.copy(this.position);
  }

  absorbGuardShield(amount) {
    if (this.defenseType === "guardShield" && this.guardDefenseTimer > 0 && this.guardShieldDurability > 0) {
      const absorbed = Math.min(this.guardShieldDurability, amount);
      this.guardShieldDurability = Math.max(0, this.guardShieldDurability - absorbed);
      if (this.guardShieldDurability <= 0) {
        this.guardShieldBrokenTimer = this.guardShieldRegenDelay;
        this.guardDefenseTimer = 0;
      }
      return amount - absorbed;
    }

    return amount;
  }

  takeDamage(amount) {
    const remainingDamage = this.absorbGuardShield(amount);
    if (remainingDamage <= 0) return false;
    const damage = this.shieldActive ? Math.max(1, Math.ceil(remainingDamage * 0.25)) : remainingDamage;
    this.hp = Math.max(0, this.hp - damage);
    return this.hp <= 0;
  }

  restoreHp() {
    this.hp = this.maxHp;
  }

  resolveBarrierCollision() {
    const actorTeam = this.team ?? this.group.userData.team ?? "player";
    for (const barrier of this.world.getColliders()) {
      // Temporary skill colliders can be team-limited. Player shields should block enemy attacks/enemies,
      // but the player must not collide with their own shield or it can push them at high speed.
      if (barrier.blocksTeams && !barrier.blocksTeams.includes(actorTeam)) continue;

      const dx = this.position.x - barrier.x;
      const dz = this.position.z - barrier.z;
      const overlapX = barrier.halfX + this.radius - Math.abs(dx);
      const overlapZ = barrier.halfZ + this.radius - Math.abs(dz);

      if (overlapX > 0 && overlapZ > 0) {
        if (overlapX < overlapZ) {
          this.position.x += Math.sign(dx || 1) * overlapX;
        } else {
          this.position.z += Math.sign(dz || 1) * overlapZ;
        }
      }
    }
  }

  activateAscend(duration, speed) {
    if (this.ascendEnergy < this.ascendMinToUse) {
      this.ascendExhausted = true;
      return false;
    }

    const ascendSpeed = speed ?? this.config.skills?.ascendSpeed ?? this.flySpeed;
    this.onGround = false;
    this.velocity.y = Math.max(this.velocity.y, ascendSpeed * 0.35);
    this.ascendEnergy = Math.max(0, this.ascendEnergy - this.ascendEnergyDrain * Math.min(duration ?? 0.12, 0.12));
    if (this.ascendEnergy <= 0) this.ascendExhausted = true;
    return true;
  }

  faceYaw(yaw) {
    // Shooting should snap the body toward the reticle so the shot feels connected to the crosshair.
    this.facingYaw = yaw;
    this.group.rotation.y = this.facingYaw;
  }

  getMoveAxes(input = {}) {
    let forwardAxis = 0;
    let strafeAxis = 0;
    if (input.forward) forwardAxis += 1;
    if (input.back) forwardAxis -= 1;
    // Keyboard left/right was opposite on PC after the mobile stick fix.
    // Keep the stick sign as-is below, and only flip the digital A/D or arrow input here.
    if (input.right) strafeAxis -= 1;
    if (input.left) strafeAxis += 1;
    if (Math.abs(input.stickY ?? 0) > 0.04) forwardAxis += input.stickY;
    if (Math.abs(input.stickX ?? 0) > 0.04) strafeAxis += input.stickX;
    return {
      forwardAxis: THREE.MathUtils.clamp(forwardAxis, -1, 1),
      strafeAxis: THREE.MathUtils.clamp(strafeAxis, -1, 1)
    };
  }

  startDodgeDefense(yaw, input = {}) {
    if (this.defenseCooldownTimer > 0 || this.dodgeTimer > 0) return false;

    const { forwardAxis, strafeAxis } = this.getMoveAxes(input);
    const cameraForward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const cameraRight = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const direction = new THREE.Vector3()
      .addScaledVector(cameraForward, forwardAxis)
      .addScaledVector(cameraRight, strafeAxis);

    // 入力がない時は照準に対して横へ回避する。敵Rapid/Slashの短距離回避に近い操作感。
    if (direction.lengthSq() <= 0.0001) direction.copy(cameraRight);
    direction.normalize();

    this.dodgeDirection.copy(direction);
    this.dodgeTimer = this.getCharacterValue("dodgeDuration", this.config.enemy?.dodgeDuration ?? 0.28);
    this.defenseCooldownTimer = this.getCharacterValue("dodgeCooldown", this.config.enemy?.dodgeCooldown ?? 2.1);
    return true;
  }

  startGuardDefense() {
    if (this.defenseCooldownTimer > 0 || this.guardShieldDurability <= 0) return false;
    this.guardDefenseTimer = this.getCharacterValue("guardDuration", this.config.enemy?.guardDuration ?? 0.85);
    this.defenseCooldownTimer = this.getCharacterValue("guardCooldown", this.config.enemy?.guardCooldown ?? 4.2);
    this.shieldActive = true;
    return true;
  }

  startDefense(yaw, input = {}) {
    if (this.defenseType === "dodge") return this.startDodgeDefense(yaw, input);
    if (this.defenseType === "guardShield") return this.startGuardDefense();
    return false;
  }

  updateDefense(dt) {
    this.defenseCooldownTimer = Math.max(0, this.defenseCooldownTimer - dt);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    this.guardDefenseTimer = Math.max(0, this.guardDefenseTimer - dt);

    if (this.guardShieldMax > 0 && this.guardDefenseTimer <= 0 && this.guardShieldDurability < this.guardShieldMax) {
      if (this.guardShieldDurability <= 0 && this.guardShieldBrokenTimer > 0) {
        this.guardShieldBrokenTimer = Math.max(0, this.guardShieldBrokenTimer - dt);
      } else {
        this.guardShieldDurability = Math.min(this.guardShieldMax, this.guardShieldDurability + this.guardShieldRegen * dt);
      }
    }

    this.shieldActive = this.guardDefenseTimer > 0 && this.guardShieldDurability > 0;
  }

  getAscendStatus() {
    const fillRate = this.ascendEnergyMax > 0 ? this.ascendEnergy / this.ascendEnergyMax : 0;
    return {
      coolingDown: this.ascendEnergy < this.ascendMinToUse,
      energy: this.ascendEnergy,
      maxEnergy: this.ascendEnergyMax,
      fillRate
    };
  }

  update(dt, input, yaw) {
    this.specialCooldownTimer = Math.max(0, this.specialCooldownTimer - dt);
    this.specialEnergy = Math.min(this.specialEnergyMax, this.specialEnergy + this.specialEnergyRegen * dt);
    this.updateDefense(dt);
    const cameraForward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const cameraRight = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = new THREE.Vector3();

    const { forwardAxis, strafeAxis } = this.getMoveAxes(input);

    const movingBackward = forwardAxis < -0.05;
    // Back input moves toward the bottom of the screen by using the camera direction.
    // The facing update below points the body with its back toward the camera while backing up.
    move.addScaledVector(cameraForward, forwardAxis);
    move.addScaledVector(cameraRight, strafeAxis);
    if (move.lengthSq() > 1) move.normalize();

    const backSpeedMultiplier = this.config.player.backSpeedMultiplier ?? 0.65;
    const speed = (input.sprint && !movingBackward ? this.sprintSpeed : this.walkSpeed)
      * (movingBackward ? backSpeedMultiplier : 1);
    this.position.x += move.x * speed * dt;
    this.position.z += move.z * speed * dt;

    if (this.dodgeTimer > 0) {
      const dodgeDuration = Math.max(0.01, this.getCharacterValue("dodgeDuration", this.config.enemy?.dodgeDuration ?? 0.28));
      const dodgeDistance = this.getCharacterValue("dodgeDistance", null);
      const dodgeSpeed = dodgeDistance !== null
        ? dodgeDistance / dodgeDuration
        : this.getCharacterValue("dodgeSpeed", this.config.enemy?.dodgeSpeed ?? 15);
      this.position.x += this.dodgeDirection.x * dodgeSpeed * dt;
      this.position.z += this.dodgeDirection.z * dodgeSpeed * dt;
    }
    this.resolveBarrierCollision();

    const jumpPressed = Boolean(input.jump);
    if (jumpPressed && !this.jumpWasPressed && this.onGround) {
      this.velocity.y = this.jumpPower;
      this.onGround = false;
    }
    this.jumpWasPressed = jumpPressed;

    const wantsAscend = Boolean(input.up);
    if (!wantsAscend) {
      this.ascendExhausted = false;
    }

    const canAscend = wantsAscend && !this.ascendExhausted && this.ascendEnergy >= this.ascendMinToUse;
    this.isAscending = false;
    if (canAscend) {
      // Holding JUMP spends ascend energy. Any regenerated energy can be used immediately.
      const ascendSpeed = this.config.skills?.ascendSpeed ?? this.flySpeed;
      if (this.onGround) {
        this.onGround = false;
        this.velocity.y = Math.max(this.velocity.y, ascendSpeed * 0.35);
      } else {
        this.velocity.y = Math.max(this.velocity.y, ascendSpeed);
      }
      this.ascendEnergy = Math.max(0, this.ascendEnergy - this.ascendEnergyDrain * dt);
      if (this.ascendEnergy <= 0) this.ascendExhausted = true;
      this.isAscending = true;
    } else if (!wantsAscend) {
      // エネルギー切れのまま押しっぱなしだと微回復と消費を繰り返して浮き続けるため、離している時だけ回復する。
      this.ascendEnergy = Math.min(this.ascendEnergyMax, this.ascendEnergy + this.ascendEnergyRegen * dt);
    }

    this.velocity.y += this.gravity * dt;
    this.position.y += this.velocity.y * dt;

    const groundY = this.world.getHeightAt(this.position.x, this.position.z) + this.groundOffset + this.groundClearance;
    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    }

    this.group.position.copy(this.position);
    if (move.lengthSq() > 0.0025) {
      // Movement direction and visual facing are separate: sideways/back input moves the position,
      // while the body keeps a camera/reticle-facing stance for readable strafe movement.
      const targetYaw = yaw;
      const turnSpeed = this.config.player.turnSpeed ?? 12;
      this.facingYaw += shortestAngleDelta(this.facingYaw, targetYaw) * Math.min(1, dt * turnSpeed);
    }
    this.group.rotation.y = this.facingYaw;
    this.updateAnimation(move.lengthSq() > 0 && this.onGround, input.sprint);
  }

  updateAnimation(moving, sprinting) {
    const t = performance.now() * 0.001;
    const runSpeed = sprinting ? this.config.player.sprintAnimationSpeed : this.config.player.runAnimationSpeed;
    const phase = t * (moving ? runSpeed : 2.0);
    const stride = moving ? Math.sin(phase) : Math.sin(phase) * 0.08;
    const counterStride = moving ? Math.sin(phase + Math.PI) : Math.sin(phase + Math.PI) * 0.08;
    const bounce = moving ? Math.abs(Math.sin(phase)) * 0.12 : Math.sin(phase) * 0.025;
    const lean = moving ? (sprinting ? 0.34 : 0.22) : 0;

    this.bodyRig.position.y = bounce;
    this.bodyRig.rotation.x = lean + (moving ? Math.sin(phase) * 0.035 : 0);
    this.bodyRig.rotation.z = moving ? Math.sin(phase) * 0.045 : Math.sin(phase) * 0.012;
    this.torso.rotation.x = moving ? 0.08 + Math.sin(phase) * 0.05 : 0;
    this.shoulderBar.rotation.z = moving ? Math.sin(phase + Math.PI) * 0.08 : 0;
    this.waist.rotation.z = moving ? Math.sin(phase) * 0.06 : 0;

    this.leftArm.shoulder.rotation.x = -stride * 1.12 - lean * 0.35;
    this.rightArm.shoulder.rotation.x = -counterStride * 1.12 - lean * 0.35;
    this.leftArm.shoulder.rotation.z = -0.18;
    this.rightArm.shoulder.rotation.z = 0.18;
    this.leftArm.elbow.rotation.x = -0.45 - Math.max(0, stride) * 0.62;
    this.rightArm.elbow.rotation.x = -0.45 - Math.max(0, counterStride) * 0.62;

    this.leftLeg.hip.rotation.x = stride * 0.98 - lean * 0.18;
    this.rightLeg.hip.rotation.x = counterStride * 0.98 - lean * 0.18;
    this.leftLeg.hip.rotation.z = -0.04;
    this.rightLeg.hip.rotation.z = 0.04;
    this.leftLeg.knee.rotation.x = Math.max(0, -stride) * 0.95;
    this.rightLeg.knee.rotation.x = Math.max(0, -counterStride) * 0.95;
    this.leftLeg.foot.rotation.x = moving ? -Math.max(0, stride) * 0.42 : 0;
    this.rightLeg.foot.rotation.x = moving ? -Math.max(0, counterStride) * 0.42 : 0;

    const pulse = performance.now() * (moving ? 0.014 : 0.005);
    this.chestCore.scale.setScalar(1 + Math.sin(pulse) * 0.1);
    this.faceRing.scale.setScalar(1 + Math.sin(pulse * 1.4) * 0.07);
  }
}
