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
    this.visualParts = [];
    this.rigJoints = [];

    const makeMaterial = (role) => {
      if (role === "glow") {
        return new THREE.MeshBasicMaterial({
          color: 0xffe066,
          transparent: true,
          opacity: 0.98,
          depthWrite: false
        });
      }

      if (role === "edge") {
        return new THREE.LineBasicMaterial({
          color: 0xd9feff,
          transparent: true,
          opacity: 0.54
        });
      }

      return new THREE.MeshStandardMaterial({
        color: role === "core" ? 0x0d8ea0 : 0x70f7ff,
        emissive: role === "core" ? 0x064a55 : 0x0d98a8,
        emissiveIntensity: role === "core" ? 0.8 : 0.54,
        roughness: 0.16,
        metalness: 0.04,
        transparent: true,
        opacity: role === "core" ? 0.42 : 0.56,
        flatShading: true,
        side: THREE.DoubleSide,
        depthWrite: false
      });
    };

    const materials = {
      crystal: makeMaterial("crystal"),
      core: makeMaterial("core"),
      glow: makeMaterial("glow"),
      edge: makeMaterial("edge")
    };

    const addTrackedObject = (object) => {
      object.userData.basePosition = object.position.clone();
      object.userData.baseRotation = object.rotation.clone();
      object.userData.baseScale = object.scale.clone();
      this.visualParts.push(object);
      return object;
    };

    const addJoint = (joint) => {
      joint.userData.basePosition = joint.position.clone();
      joint.userData.baseRotation = joint.rotation.clone();
      joint.userData.baseScale = joint.scale.clone();
      this.rigJoints.push(joint);
      return joint;
    };

    const addMesh = (parent, geometry, role, position, rotation = null, scale = null, options = {}) => {
      const material = materials[role].clone();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.materialRole = role;
      if (options.variant) mesh.userData.variant = options.variant;
      mesh.position.copy(position);
      if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
      if (scale) mesh.scale.copy(scale);
      mesh.castShadow = role !== "glow";
      mesh.receiveShadow = false;

      if (role !== "glow") {
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 12), materials.edge.clone());
        outline.userData.materialRole = "edge";
        outline.renderOrder = 5;
        mesh.add(addTrackedObject(outline));
      }

      parent.add(addTrackedObject(mesh));
      return mesh;
    };

    const addGroup = (parent, position, rotation = null, scale = null, options = {}) => {
      const group = new THREE.Group();
      if (options.variant) group.userData.variant = options.variant;
      group.position.copy(position);
      if (rotation) group.rotation.set(rotation.x, rotation.y, rotation.z);
      if (scale) group.scale.copy(scale);
      parent.add(addTrackedObject(group));
      return group;
    };

    const geometries = {
      head: new THREE.IcosahedronGeometry(0.36, 1),
      torso: new THREE.DodecahedronGeometry(0.66, 0),
      waist: new THREE.OctahedronGeometry(0.45, 0),
      shoulder: new THREE.OctahedronGeometry(0.5, 0),
      joint: new THREE.OctahedronGeometry(0.22, 0),
      limb: new THREE.CylinderGeometry(0.16, 0.21, 0.72, 6, 1),
      lowerLimb: new THREE.CylinderGeometry(0.13, 0.18, 0.66, 6, 1),
      hand: new THREE.DodecahedronGeometry(0.18, 0),
      foot: new THREE.ConeGeometry(0.28, 0.54, 5),
      shard: new THREE.ConeGeometry(0.12, 0.58, 5),
      blade: new THREE.ConeGeometry(0.08, 0.82, 4),
      chest: new THREE.OctahedronGeometry(0.22, 0),
      eyeRing: new THREE.TorusGeometry(0.13, 0.018, 8, 28),
      innerEyeRing: new THREE.TorusGeometry(0.065, 0.012, 8, 24),
      eyeDot: new THREE.SphereGeometry(0.032, 8, 6),
      energyRod: new THREE.BoxGeometry(0.08, 0.66, 0.055),
      guardPlate: new THREE.BoxGeometry(0.16, 0.7, 0.86)
    };

    this.torso = addMesh(
      this.bodyRig,
      geometries.torso,
      "crystal",
      new THREE.Vector3(0, 0.36, 0),
      null,
      new THREE.Vector3(0.72, 1.24, 0.42)
    );

    this.waist = addMesh(
      this.bodyRig,
      geometries.waist,
      "core",
      new THREE.Vector3(0, -0.38, 0),
      null,
      new THREE.Vector3(1.0, 0.56, 0.72)
    );

    this.shoulderBar = addMesh(
      this.bodyRig,
      geometries.shoulder,
      "crystal",
      new THREE.Vector3(0, 0.95, 0),
      null,
      new THREE.Vector3(1.85, 0.32, 0.5)
    );

    this.neckCrystal = addMesh(
      this.bodyRig,
      geometries.limb,
      "core",
      new THREE.Vector3(0, 1.22, 0),
      null,
      new THREE.Vector3(0.62, 0.38, 0.62)
    );

    this.headCrystal = addMesh(
      this.bodyRig,
      geometries.head,
      "crystal",
      new THREE.Vector3(0, 1.62, 0),
      null,
      new THREE.Vector3(0.78, 1.28, 0.82)
    );

    this.faceRing = addGroup(this.bodyRig, new THREE.Vector3(0, 1.63, 0.32));
    addMesh(this.faceRing, geometries.eyeRing, "glow", new THREE.Vector3(0, 0, 0));
    addMesh(this.faceRing, geometries.innerEyeRing, "glow", new THREE.Vector3(0, 0, 0.006));
    addMesh(this.faceRing, geometries.eyeDot, "glow", new THREE.Vector3(0, 0, 0.015));

    this.chestCore = addGroup(this.bodyRig, new THREE.Vector3(0, 0.62, 0.34));
    addMesh(
      this.chestCore,
      geometries.chest,
      "glow",
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, Math.PI / 4),
      new THREE.Vector3(1.05, 1.35, 0.42)
    );

    addMesh(
      this.bodyRig,
      geometries.energyRod,
      "glow",
      new THREE.Vector3(0, 0.05, 0.35),
      null,
      new THREE.Vector3(1.0, 1.0, 1.0)
    );

    addMesh(
      this.bodyRig,
      geometries.shard,
      "crystal",
      new THREE.Vector3(0, 1.98, 0),
      null,
      new THREE.Vector3(0.72, 0.78, 0.72),
      { variant: "runner" }
    );
    addMesh(
      this.bodyRig,
      geometries.shard,
      "crystal",
      new THREE.Vector3(0, 2.0, -0.04),
      new THREE.Vector3(0.34, 0, 0),
      new THREE.Vector3(0.95, 1.18, 0.95),
      { variant: "rapid" }
    );
    addMesh(
      this.bodyRig,
      geometries.blade,
      "crystal",
      new THREE.Vector3(0, 1.97, -0.03),
      new THREE.Vector3(0.48, 0, 0),
      new THREE.Vector3(1.2, 0.95, 1.2),
      { variant: "slash" }
    );
    addMesh(
      this.bodyRig,
      geometries.shoulder,
      "crystal",
      new THREE.Vector3(0, 1.83, -0.02),
      null,
      new THREE.Vector3(0.78, 0.32, 0.78),
      { variant: "guard" }
    );

    const createArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.78, 0.86, 0);
      addJoint(shoulder);
      this.bodyRig.add(shoulder);

      addMesh(shoulder, geometries.joint, "core", new THREE.Vector3(0, 0, 0), null, new THREE.Vector3(1.08, 1.0, 1.08));
      addMesh(
        shoulder,
        geometries.limb,
        "crystal",
        new THREE.Vector3(side * 0.05, -0.34, 0),
        new THREE.Vector3(0, 0, side * 0.1),
        new THREE.Vector3(0.9, 1.0, 0.9)
      );
      addMesh(
        shoulder,
        geometries.shard,
        "crystal",
        new THREE.Vector3(side * 0.26, 0.12, -0.03),
        new THREE.Vector3(0, 0, side * -0.64),
        new THREE.Vector3(0.82, 0.68, 0.82),
        { variant: "rapid" }
      );
      addMesh(
        shoulder,
        geometries.blade,
        "crystal",
        new THREE.Vector3(side * 0.28, -0.22, 0.02),
        new THREE.Vector3(0.1, 0, side * -0.58),
        new THREE.Vector3(0.72, 0.92, 0.72),
        { variant: "slash" }
      );
      addMesh(
        shoulder,
        geometries.guardPlate,
        "crystal",
        new THREE.Vector3(side * 0.18, -0.18, 0.02),
        new THREE.Vector3(0, 0, side * 0.05),
        new THREE.Vector3(0.72, 0.68, 0.72),
        { variant: "guard" }
      );

      const elbow = new THREE.Group();
      elbow.position.set(side * 0.08, -0.7, 0);
      addJoint(elbow);
      shoulder.add(elbow);

      addMesh(elbow, geometries.joint, "core", new THREE.Vector3(0, 0, 0), null, new THREE.Vector3(0.86, 0.78, 0.86));
      addMesh(
        elbow,
        geometries.lowerLimb,
        "crystal",
        new THREE.Vector3(side * 0.03, -0.31, 0.02),
        new THREE.Vector3(0, 0, side * 0.08),
        new THREE.Vector3(0.88, 1.0, 0.88)
      );
      addMesh(elbow, geometries.hand, "core", new THREE.Vector3(side * 0.04, -0.67, 0.04), null, new THREE.Vector3(0.92, 0.82, 1.0));
      addMesh(
        elbow,
        geometries.blade,
        "crystal",
        new THREE.Vector3(side * 0.22, -0.34, 0.04),
        new THREE.Vector3(0.05, 0, side * -0.4),
        new THREE.Vector3(0.7, 0.95, 0.7),
        { variant: "slash" }
      );

      return { shoulder, elbow };
    };

    const createLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.26, -0.46, 0);
      addJoint(hip);
      this.bodyRig.add(hip);

      addMesh(hip, geometries.joint, "core", new THREE.Vector3(0, 0, 0), null, new THREE.Vector3(0.92, 0.82, 0.92));
      addMesh(
        hip,
        geometries.limb,
        "crystal",
        new THREE.Vector3(0, -0.36, 0),
        new THREE.Vector3(0, 0, side * 0.04),
        new THREE.Vector3(1.02, 1.08, 1.02)
      );

      const knee = new THREE.Group();
      knee.position.set(0, -0.72, 0);
      addJoint(knee);
      hip.add(knee);

      addMesh(knee, geometries.joint, "core", new THREE.Vector3(0, 0, 0), null, new THREE.Vector3(0.84, 0.72, 0.84));
      addMesh(
        knee,
        geometries.lowerLimb,
        "crystal",
        new THREE.Vector3(0, -0.38, 0.02),
        new THREE.Vector3(0, 0, -side * 0.03),
        new THREE.Vector3(0.98, 1.08, 0.98)
      );
      addMesh(
        knee,
        geometries.shard,
        "glow",
        new THREE.Vector3(side * 0.13, -0.4, 0.04),
        null,
        new THREE.Vector3(0.36, 0.74, 0.36)
      );
      const foot = addMesh(
        knee,
        geometries.foot,
        "core",
        new THREE.Vector3(0, -0.8, 0.18),
        new THREE.Vector3(Math.PI / 2, 0, 0),
        new THREE.Vector3(1.05, 0.72, 1.18)
      );

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

  getCrystalVisual(character = {}) {
    const id = character.id ?? "runner";
    const visuals = {
      runner: {
        variant: "runner",
        crystal: "#67f7ff",
        core: "#0aa6b5",
        glow: "#ffe066",
        edge: "#d9feff",
        emissive: "#12d8e8",
        opacity: 0.58,
        coreOpacity: 0.44,
        body: [1, 1, 1],
        torso: [1, 1, 1],
        shoulders: 1,
        head: [1, 1, 1],
        armSpread: 1,
        legSpread: 1
      },
      rapid: {
        variant: "rapid",
        crystal: "#ff4b4b",
        core: "#7f1d1d",
        glow: "#ffd166",
        edge: "#fecaca",
        emissive: "#ef4444",
        opacity: 0.55,
        coreOpacity: 0.4,
        body: [0.88, 1.05, 0.9],
        torso: [0.86, 1.08, 0.88],
        shoulders: 0.88,
        head: [0.88, 1.1, 0.9],
        armSpread: 0.94,
        legSpread: 0.88
      },
      slash: {
        variant: "slash",
        crystal: "#8b5cf6",
        core: "#312e81",
        glow: "#c4b5fd",
        edge: "#ddd6fe",
        emissive: "#7c3aed",
        opacity: 0.56,
        coreOpacity: 0.42,
        body: [0.92, 1.08, 0.92],
        torso: [0.86, 1.12, 0.9],
        shoulders: 1.08,
        head: [0.86, 1.18, 0.88],
        armSpread: 1.05,
        legSpread: 0.9
      },
      guard: {
        variant: "guard",
        crystal: "#a3e635",
        core: "#166534",
        glow: "#fef08a",
        edge: "#dcfce7",
        emissive: "#84cc16",
        opacity: 0.62,
        coreOpacity: 0.5,
        body: [1.14, 0.98, 1.12],
        torso: [1.15, 1.0, 1.16],
        shoulders: 1.3,
        head: [1.08, 0.98, 1.08],
        armSpread: 1.16,
        legSpread: 1.12
      }
    };

    if (visuals[id]) return visuals[id];

    return {
      ...visuals.runner,
      crystal: character.color ?? visuals.runner.crystal,
      variant: id
    };
  }

  resetVisualPart(object) {
    if (!object?.userData?.basePosition) return;
    object.position.copy(object.userData.basePosition);
    object.rotation.copy(object.userData.baseRotation);
    object.scale.copy(object.userData.baseScale);
  }

  applyCharacterVisual(character) {
    const visual = this.getCrystalVisual(character);
    const scale = this.baseRigScale * (character.playerScale ?? 1);
    this.bodyRig.scale.set(scale * visual.body[0], scale * visual.body[1], scale * visual.body[2]);

    for (const joint of this.rigJoints ?? []) {
      this.resetVisualPart(joint);
    }

    for (const part of this.visualParts ?? []) {
      this.resetVisualPart(part);
      const variant = part.userData.variant;
      part.visible = !variant || variant === visual.variant;

      const material = part.material;
      if (!material?.color) continue;

      const role = part.userData.materialRole ?? "crystal";
      const color = role === "glow"
        ? visual.glow
        : role === "core"
          ? visual.core
          : role === "edge"
            ? visual.edge
            : visual.crystal;
      material.color.set(color);
      material.transparent = true;
      if (role === "glow") {
        material.opacity = 0.98;
      } else if (role === "edge") {
        material.opacity = 0.52;
      } else if (role === "core") {
        material.opacity = visual.coreOpacity;
      } else {
        material.opacity = visual.opacity;
      }

      if (material.emissive) {
        material.emissive.set(role === "core" ? visual.core : visual.emissive);
        material.emissiveIntensity = role === "core" ? 0.78 : 0.62;
      }
      material.needsUpdate = true;
    }

    this.torso.scale.multiply(new THREE.Vector3(...visual.torso));
    this.waist.scale.x *= visual.torso[0] * 0.94;
    this.waist.scale.z *= visual.torso[2] * 0.95;
    this.shoulderBar.scale.x *= visual.shoulders;
    this.headCrystal.scale.multiply(new THREE.Vector3(...visual.head));
    this.leftArm.shoulder.position.x = -0.78 * visual.armSpread;
    this.rightArm.shoulder.position.x = 0.78 * visual.armSpread;
    this.leftLeg.hip.position.x = -0.26 * visual.legSpread;
    this.rightLeg.hip.position.x = 0.26 * visual.legSpread;
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

  takeDamage(amount, source = null) {
    const remainingDamage = source?.type === "zone" ? amount : this.absorbGuardShield(amount);
    if (remainingDamage <= 0) return false;
    const damage = source?.type === "zone"
      ? remainingDamage
      : this.shieldActive ? Math.max(1, Math.ceil(remainingDamage * 0.25)) : remainingDamage;
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
