import * as THREE from "three";
import { BattleRoyaleManager, EnemyManager } from "./enemy.js";
import { ThirdPersonCamera } from "./camera.js";
import { InputController } from "./input.js";
import { Player } from "./player.js";
import { SkillController } from "./skills.js";
import { colorFromHex } from "./utils.js";
import { World } from "./world.js";

async function loadConfig() {
  const response = await fetch("./config.json");
  if (!response.ok) {
    throw new Error(`Failed to load config.json: ${response.status}`);
  }
  return response.json();
}

function createScene(config) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colorFromHex(config.scene.background));
  scene.fog = new THREE.FogExp2(colorFromHex(config.scene.fogColor), config.scene.fogDensity);
  return scene;
}

function isLowPowerDevice() {
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const limitedCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 760;
  return coarsePointer || reducedMotion || limitedCpu || smallViewport;
}

function createPerformanceProfile(config) {
  const rendererConfig = config.renderer ?? {};
  const lowPower = isLowPowerDevice();
  const maxPixelRatio = lowPower
    ? Math.min(rendererConfig.maxPixelRatio ?? 2, rendererConfig.mobileMaxPixelRatio ?? 1.25)
    : rendererConfig.maxPixelRatio ?? 2;

  return {
    lowPower,
    maxPixelRatio,
    antialias: lowPower ? rendererConfig.mobileAntialias === true : rendererConfig.antialias !== false,
    shadows: lowPower ? rendererConfig.mobileShadows === true : rendererConfig.shadows !== false,
    shadowMapSize: lowPower
      ? rendererConfig.mobileShadowMapSize ?? 768
      : rendererConfig.shadowMapSize ?? 1536,
    activeFps: lowPower ? rendererConfig.mobileTargetFps ?? 45 : rendererConfig.targetFps ?? 60,
    idleFps: lowPower ? rendererConfig.mobileIdleFps ?? 12 : rendererConfig.idleFps ?? 20,
    hudIntervalMs: 1000 / Math.max(1, rendererConfig.hudFps ?? 10),
    idleHudIntervalMs: 1000 / Math.max(1, rendererConfig.idleHudFps ?? 4)
  };
}

function createRenderer(config, performanceProfile) {
  const renderer = new THREE.WebGLRenderer({
    antialias: performanceProfile.antialias,
    powerPreference: performanceProfile.lowPower ? "low-power" : "default"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, performanceProfile.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = performanceProfile.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

function addLights(scene, config, performanceProfile) {
  const lights = config.lights;
  const hemiLight = new THREE.HemisphereLight(
    colorFromHex(lights.hemisphereSky),
    colorFromHex(lights.hemisphereGround),
    lights.hemisphereIntensity
  );
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(colorFromHex(lights.sunColor), lights.sunIntensity);
  sunLight.position.set(...lights.sunPosition);
  sunLight.castShadow = performanceProfile.shadows;
  sunLight.shadow.mapSize.width = performanceProfile.shadowMapSize;
  sunLight.shadow.mapSize.height = performanceProfile.shadowMapSize;
  sunLight.shadow.camera.left = -180;
  sunLight.shadow.camera.right = 180;
  sunLight.shadow.camera.top = 180;
  sunLight.shadow.camera.bottom = -180;
  scene.add(sunLight);

  const coreLight = new THREE.PointLight(colorFromHex(lights.coreColor), lights.coreIntensity, lights.coreDistance);
  coreLight.position.set(...lights.corePosition);
  scene.add(coreLight);
}

function updateHud(player, world, rendererElement, enemyManager, gameState, now = performance.now()) {
  const hudInterval = gameState.started && !gameState.paused
    ? gameState.performance?.hudIntervalMs ?? 100
    : gameState.performance?.idleHudIntervalMs ?? 250;
  if (gameState.lastHudUpdateTime && now - gameState.lastHudUpdateTime < hudInterval) return;
  gameState.lastHudUpdateTime = now;

  const status = document.getElementById("status");
  const centerMessage = document.getElementById("centerMessage");
  const playerHpFill = document.getElementById("playerHpFill");
  const playerHpText = document.getElementById("playerHpText");
  const playerSpecialFill = document.getElementById("playerSpecialFill");
  const playerSpecialText = document.getElementById("playerSpecialText");
  const enemyHpList = document.getElementById("enemyHpList");
  const livesText = document.getElementById("livesText");
  const scoreText = document.getElementById("scoreText");
  const aliveStat = document.getElementById("aliveStat");
  const aliveText = document.getElementById("aliveText");
  const modeText = document.getElementById("modeText");
  const ascendMeter = document.getElementById("ascendMeter");
  const ascendMeterFill = document.getElementById("ascendMeterFill");
  const ascendMeterText = document.getElementById("ascendMeterText");
  const { cx, cz, chunkCount } = world.getChunkInfo(player.position);
  const playerHpRate = Math.max(0, player.hp / player.maxHp);

  playerHpFill.style.width = `${playerHpRate * 100}%`;
  playerHpText.textContent = `${player.hp}/${player.maxHp}`;
  if (playerSpecialFill && playerSpecialText) {
    const specialStatus = player.getSpecialStatus();
    const specialRate = Math.max(0, Math.min(1, specialStatus.fillRate));
    playerSpecialFill.style.width = `${specialRate * 100}%`;
    playerSpecialFill.classList.toggle("is-ready", specialStatus.ready);
    playerSpecialText.textContent = `${Math.round(specialRate * 100)}%`;
  }
  livesText.textContent = gameState.lives;
  scoreText.textContent = gameState.score;
  if (aliveStat && aliveText) {
    const battleRoyale = gameState.mode === "battleRoyale";
    aliveStat.hidden = !battleRoyale;
    if (battleRoyale) aliveText.textContent = enemyManager.getAliveCount?.(player) ?? gameState.aliveCount ?? 1;
  }
  modeText.textContent = gameState.paused
    ? "PAUSE"
    : gameState.started
      ? (gameState.mode === "battleRoyale" ? "BR" : "RUN")
      : "READY";

  if (ascendMeter && ascendMeterFill && ascendMeterText) {
    // The vertical meter now shows ascend energy: it drains while rising and regenerates anytime not rising.
    const ascendStatus = player.getAscendStatus();
    const fillRate = Math.max(0, Math.min(1, ascendStatus.fillRate));
    ascendMeter.classList.toggle("is-cooldown", ascendStatus.coolingDown);
    ascendMeterFill.style.height = `${fillRate * 100}%`;
    ascendMeterText.textContent = `${Math.round(fillRate * 100)}%`;
  }

  const visibleEnemies = gameState.mode === "battleRoyale"
    ? []
    : enemyManager.getDisplayEnemies?.() ?? (enemyManager.getActiveEnemy() ? [enemyManager.getActiveEnemy()] : []);
  const enemyHtml = visibleEnemies.map((enemy) => {
    const enemyHpRate = Math.max(0, enemy.hp / enemy.maxHp);
    const specialStatus = enemy.getSpecialStatus?.() ?? { fillRate: 0, ready: false };
    const specialRate = Math.max(0, Math.min(1, specialStatus.fillRate));
    const shieldStatus = enemy.getShieldStatus?.();
    const shieldRate = shieldStatus ? Math.max(0, Math.min(1, shieldStatus.fillRate)) : 0;
    const shieldMeter = shieldStatus ? `
      <div class="enemy-meter-item enemy-shield-meter">
        <span>SH</span>
        <div class="hp-bar enemy-meter"><div class="hp-fill shield ${shieldStatus.broken ? "is-broken" : ""}" style="width: ${shieldRate * 100}%"></div></div>
        <strong>${Math.round(shieldStatus.durability)}/${shieldStatus.maxDurability}</strong>
      </div>
    ` : "";
    return `
      <div class="enemy-card">
        <span class="enemy-name">${enemy.displayName}</span>
        <div class="enemy-meter-group">
          <div class="enemy-meter-item">
            <span>HP</span>
            <div class="hp-bar enemy-meter"><div class="hp-fill ${enemy.typeId}" style="width: ${enemyHpRate * 100}%"></div></div>
            <strong>${enemy.hp}/${enemy.maxHp}</strong>
          </div>
          <div class="enemy-meter-item">
            <span>SP</span>
            <div class="hp-bar enemy-meter"><div class="hp-fill special ${specialStatus.ready ? "is-ready" : ""}" style="width: ${specialRate * 100}%"></div></div>
            <strong>${Math.round(specialStatus.energy)}/${specialStatus.maxEnergy}</strong>
          </div>
          ${shieldMeter}
        </div>
      </div>
    `;
  }).join("");
  if (enemyHpList.__lastHtml !== enemyHtml) {
    enemyHpList.innerHTML = enemyHtml;
    enemyHpList.__lastHtml = enemyHtml;
  }

  if (!status.hidden) {
    status.textContent = `X:${player.position.x.toFixed(1)} Y:${player.position.y.toFixed(1)} Z:${player.position.z.toFixed(1)} / Chunk:${cx},${cz} / ${chunkCount} chunks`;
  }

  if (document.pointerLockElement === rendererElement) {
    centerMessage.style.display = "none";
  } else if (window.innerWidth > 800 && window.matchMedia("(pointer: fine)").matches) {
    centerMessage.style.display = "grid";
  }
}

async function main() {
  const config = await loadConfig();
  const performanceProfile = createPerformanceProfile(config);
  config.performance = performanceProfile;
  document.documentElement.style.setProperty("--crosshair-y", `${(config.camera.crosshairY ?? 0.45) * 100}%`);
  const scene = createScene(config);
  const camera = new THREE.PerspectiveCamera(
    config.camera.fov,
    window.innerWidth / window.innerHeight,
    config.camera.near,
    config.camera.far
  );
  const renderer = createRenderer(config, performanceProfile);

  addLights(scene, config, performanceProfile);

  const world = new World(scene, config);
  const player = new Player(scene, config, world);
  const enemyManager = new EnemyManager(scene, config, world);
  let battleRoyaleManager = null;
  const skills = new SkillController(scene, config, world);
  const input = new InputController(
    renderer.domElement,
    config,
    () => player.reset(input.view),
    (action) => {
      if (action === "pause") {
        togglePause();
        return;
      }
      if (action === "title") {
        requestTitleReturn();
        return;
      }
      if (gameState.started && !gameState.paused && !gameState.gameOver) {
        if (action === "shoot") {
          firePlayerAttack();
          return;
        }

        if (action === "shield") {
          activatePlayerDefense();
          return;
        }

        if (action === "mine" || action === "special") {
          activatePlayerSpecial();
          return;
        }

        // Other body-based actions still use the current character facing direction.
        skills.trigger(action, player, input.view.yaw);
      }
    }
  );
  const thirdPersonCamera = new ThirdPersonCamera(camera, config);

  function getBattleRoyaleManager() {
    if (!battleRoyaleManager) {
      battleRoyaleManager = new BattleRoyaleManager(scene, config, world);
    }
    return battleRoyaleManager;
  }

  function getActiveEnemyManager() {
    return gameState.mode === "battleRoyale" ? getBattleRoyaleManager() : enemyManager;
  }

  player.reset(input.view);
  world.createBarriers();
  world.updateChunks(player.position);
  enemyManager.start(player.position);

  const bestScoreKeys = {
    normal: "humanoidRunnerBestScore.normal",
    battleRoyale: "humanoidRunnerBestScore.battleRoyale"
  };

  function readBestScore(mode) {
    const storedValue = localStorage.getItem(bestScoreKeys[mode]);
    if (storedValue !== null) return Number(storedValue || 0);
    if (mode === "normal") return Number(localStorage.getItem("humanoidRunnerBestScore") || 0);
    return 0;
  }

  const gameState = {
    started: false,
    paused: false,
    gameOver: false,
    victory: false,
    mode: "normal",
    aliveCount: 1,
    selectedCharacter: "runner",
    lives: 3,
    score: 0,
    bestScores: {
      normal: readBestScore("normal"),
      battleRoyale: readBestScore("battleRoyale")
    },
    performance: performanceProfile,
    lastHudUpdateTime: 0
  };

  function handleEnemyDeath(enemy, source = null) {
    if (gameState.mode === "battleRoyale") {
      if (source?.team === "player") gameState.score += 1;
      getBattleRoyaleManager().handleEnemyDeath(enemy);
      return;
    }

    gameState.score += 1;
    enemyManager.handleEnemyDeath(enemy);
  }

  function firePlayerAttack() {
    const aimTarget = thirdPersonCamera.getReticleAimTarget();
    const attackType = player.attackType ?? "shot";
    player.faceYaw(input.view.yaw);

    if (attackType === "rapid") {
      // Rapid uses the enemy Rapid-style red bolt, but owned by the player so it damages enemies.
      skills.projectileAt(player, aimTarget, "player", 0xff3b30, {
        shape: "bolt",
        width: 0.14,
        height: 0.14,
        length: 1.45,
        originHeight: player.getCharacterValue("attackOriginHeight", 1.62),
        damage: player.getCharacterValue("attackDamage", 14),
        speed: player.getCharacterValue("attackSpeed", 62),
        lifetime: player.getCharacterValue("attackLifetime", 1.7),
        hitRadius: player.getCharacterValue("attackHitRadius", 0.34),
        pitch: input.view.pitch
      });
      return;
    }

    if (attackType === "slash") {
      skills.slashFrom(player, aimTarget, {
        team: "player",
        color: 0x8b5cf6,
        opacity: 0.72,
        damage: player.getCharacterValue("slashDamage", config.enemy.slashDamage),
        speed: player.getCharacterValue("slashSpeed", config.enemy.slashSpeed),
        lifetime: player.getCharacterValue("slashLifetime", config.enemy.slashLifetime),
        maxDistance: player.getCharacterValue("slashMaxDistance", config.enemy.slashMaxDistance),
        hitRadius: player.getCharacterValue("slashHitRadius", config.enemy.slashHitRadius),
        originHeight: player.getCharacterValue("slashOriginHeight", config.skills.slashOriginHeight),
        targetHeight: player.getCharacterValue("slashTargetHeight", config.skills.slashTargetHeight),
        pitch: input.view.pitch
      });
      return;
    }

    if (attackType === "cross") {
      skills.crossShotAt(player, aimTarget, {
        team: "player",
        color: 0xe9feff,
        damage: player.getCharacterValue("attackDamage", 17),
        speed: player.getCharacterValue("attackSpeed", 38),
        lifetime: player.getCharacterValue("attackLifetime", 2.7),
        hitRadius: player.getCharacterValue("attackHitRadius", 0.72),
        length: player.getCharacterValue("crossLength", 1.85),
        width: player.getCharacterValue("crossWidth", 0.18),
        originHeight: player.getCharacterValue("attackOriginHeight", 1.65),
        verticalAimScale: 1,
        pitch: input.view.pitch
      });
      return;
    }

    skills.shootAt(player, aimTarget, "player", 0xfff4a3, {
      pitch: input.view.pitch
    });
  }

  function activatePlayerDefense() {
    player.faceYaw(input.view.yaw);

    if (player.defenseType === "placedShield") {
      // Runner keeps the placed shield. It uses the reticle yaw so shield placement matches aiming.
      skills.trigger("shield", player, input.view.yaw);
      return;
    }

    player.startDefense(input.view.yaw, input.state);
  }

  function activatePlayerSpecial() {
    if (!player.spendSpecial()) return;

    const aimTarget = thirdPersonCamera.getReticleAimTarget();
    const specialType = player.specialType;
    player.faceYaw(input.view.yaw);

    if (specialType === "mine") {
      skills.placeMineAt(player, aimTarget, "player", {
        triggerRadius: player.getSpecialValue("mineTriggerRadius", config.skills.mineTriggerRadius),
        explosionRadius: player.getSpecialValue("mineExplosionRadius", config.skills.explosionRadius),
        damage: player.getSpecialValue("mineDamage", config.skills.projectileDamage * 2),
        fuse: player.getSpecialValue("mineFuse", config.skills.mineFuse),
        throwSpeed: player.getSpecialValue("mineThrowSpeed", config.skills.mineThrowSpeed),
        throwUpPower: player.getSpecialValue("mineThrowUpPower", config.skills.mineThrowUpPower)
      });
      return;
    }

    if (specialType === "rocketVolley") {
      skills.startRocketVolley(player, aimTarget, "player", {
        count: player.getSpecialValue("rocketCount", 6),
        interval: player.getSpecialValue("rocketInterval", 0.17),
        damage: player.getSpecialValue("rocketDamage", 12),
        explosionDamage: player.getSpecialValue("rocketExplosionDamage", 22),
        speed: player.getSpecialValue("rocketSpeed", 34),
        explosionRadius: player.getSpecialValue("rocketExplosionRadius", 3.6),
        radius: player.getSpecialValue("rocketRadius", 0.5),
        hitRadius: player.getSpecialValue("rocketHitRadius", 0.75),
        verticalAimScale: 1,
        pitch: input.view.pitch
      });
      return;
    }

    if (specialType === "wideSlash") {
      skills.slashFrom(player, aimTarget, {
        team: "player",
        color: 0xb084ff,
        opacity: 0.8,
        damage: player.getSpecialValue("specialSlashDamage", 42),
        speed: player.getSpecialValue("specialSlashSpeed", 34),
        lifetime: player.getSpecialValue("specialSlashLifetime", 2.1),
        maxDistance: player.getSpecialValue("specialSlashMaxDistance", 42),
        hitRadius: player.getSpecialValue("specialSlashHitRadius", 3.6),
        visualScale: player.getSpecialValue("specialSlashVisualScale", 3.45),
        originHeight: 1.55,
        targetHeight: 1.2,
        pitch: input.view.pitch
      });
      return;
    }

    if (specialType === "beam") {
      skills.beamFrom(player, aimTarget, {
        team: "player",
        targets: getActiveEnemyManager().getAliveEnemies(),
        color: 0x9ff8ff,
        range: player.getSpecialValue("beamRange", 88),
        width: player.getSpecialValue("beamWidth", 0.72),
        damage: player.getSpecialValue("beamDamage", 42),
        duration: player.getSpecialValue("beamDuration", 2),
        hitRadius: player.getSpecialValue("beamHitRadius", 1.18),
        originHeight: 1.75,
        targetHeight: 1.35,
        verticalAimScale: 1,
        pitch: input.view.pitch
      }, {
        onEnemyDeath: handleEnemyDeath
      });
    }
  }

  const startScreen = document.getElementById("startScreen");
  const titleMenu = document.getElementById("titleMenu");
  const robotSelectPanel = document.getElementById("robotSelectPanel");
  const howToPlayPanel = document.getElementById("howToPlayPanel");
  const startButton = document.getElementById("startButton");
  const battleRoyaleButton = document.getElementById("battleRoyaleButton");
  const robotSelectButton = document.getElementById("robotSelectButton");
  const howToPlayButton = document.getElementById("howToPlayButton");
  const robotBackButton = document.getElementById("robotBackButton");
  const howToPlayBackButton = document.getElementById("howToPlayBackButton");
  const titleNormalBestScore = document.getElementById("titleNormalBestScore");
  const titleBattleRoyaleBestScore = document.getElementById("titleBattleRoyaleBestScore");
  const normalButtonBestScore = document.getElementById("normalButtonBestScore");
  const battleRoyaleButtonBestScore = document.getElementById("battleRoyaleButtonBestScore");
  const pauseButton = document.getElementById("pauseButton");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeButton = document.getElementById("resumeButton");
  const pauseTitleButton = document.getElementById("pauseTitleButton");
  const titleReturnOverlay = document.getElementById("titleReturnOverlay");
  const confirmTitleYes = document.getElementById("confirmTitleYes");
  const confirmTitleNo = document.getElementById("confirmTitleNo");
  const resultScreen = document.getElementById("resultScreen");
  const resultTitle = document.getElementById("resultTitle");
  const retryButton = document.getElementById("retryButton");
  const finalScoreText = document.getElementById("finalScoreText");
  const resultBestScoreText = document.getElementById("resultBestScoreText");

  function getBestScore(mode = gameState.mode) {
    return gameState.bestScores[mode] ?? 0;
  }

  function updateBestScoreDisplays() {
    const normalBest = getBestScore("normal");
    const battleRoyaleBest = getBestScore("battleRoyale");
    if (titleNormalBestScore) titleNormalBestScore.textContent = normalBest;
    if (titleBattleRoyaleBestScore) titleBattleRoyaleBestScore.textContent = battleRoyaleBest;
    if (normalButtonBestScore) normalButtonBestScore.textContent = normalBest;
    if (battleRoyaleButtonBestScore) battleRoyaleButtonBestScore.textContent = battleRoyaleBest;
  }

  function saveBestScore(mode, score) {
    gameState.bestScores[mode] = score;
    localStorage.setItem(bestScoreKeys[mode], String(score));
  }

  updateBestScoreDisplays();

  function showTitleView(view) {
    titleMenu.hidden = view !== "menu";
    robotSelectPanel.hidden = view !== "robot";
    howToPlayPanel.hidden = view !== "howto";
  }

  function showTitleScreen() {
    gameState.mode = "normal";
    gameState.aliveCount = 1;
    startScreen.style.display = "grid";
    showTitleView("menu");
    updateBestScoreDisplays();
  }

  function setPause(paused) {
    if (!gameState.started || gameState.gameOver) return;
    gameState.paused = paused;
    pauseOverlay.hidden = !paused;
    pauseButton.textContent = paused ? "RESUME" : "PAUSE";
  }

  function togglePause() {
    setPause(!gameState.paused);
  }

  function resetRun(mode = "normal") {
    gameState.started = true;
    gameState.paused = false;
    gameState.gameOver = false;
    gameState.victory = false;
    gameState.mode = mode;
    gameState.lives = mode === "battleRoyale" ? 1 : 3;
    gameState.score = 0;
    gameState.aliveCount = mode === "battleRoyale" ? (config.battleRoyale?.totalParticipants ?? 100) : 1;
    skills.clearAll();
    enemyManager.stop();
    battleRoyaleManager?.stop();
    player.setCharacter(gameState.selectedCharacter);
    player.reset(input.view);
    if (mode === "battleRoyale") {
      getBattleRoyaleManager().start(player.position);
    } else {
      enemyManager.start(player.position);
    }
    startScreen.style.display = "none";
    pauseOverlay.hidden = true;
    titleReturnOverlay.hidden = true;
    resultScreen.hidden = true;
    pauseButton.textContent = "PAUSE";
  }

  function requestTitleReturn() {
    if (!gameState.started || gameState.gameOver) return;
    gameState.paused = true;
    pauseOverlay.hidden = true;
    titleReturnOverlay.hidden = false;
    pauseButton.textContent = "RESUME";
  }

  function cancelTitleReturn() {
    titleReturnOverlay.hidden = true;
    setPause(false);
  }

  function returnToTitle() {
    if (document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock?.();
    }
    gameState.started = false;
    gameState.paused = false;
    gameState.gameOver = false;
    gameState.victory = false;
    gameState.mode = "normal";
    gameState.lives = 3;
    gameState.score = 0;
    gameState.aliveCount = 1;
    skills.clearAll();
    battleRoyaleManager?.stop();
    player.setCharacter(gameState.selectedCharacter);
    player.reset(input.view);
    enemyManager.start(player.position);
    pauseOverlay.hidden = true;
    titleReturnOverlay.hidden = true;
    resultScreen.hidden = true;
    pauseButton.textContent = "PAUSE";
    showTitleScreen();
  }

  function finishGame(victory = false) {
    gameState.started = false;
    gameState.paused = false;
    gameState.gameOver = true;
    gameState.victory = victory;
    const mode = gameState.mode;
    const bestScore = getBestScore(mode);
    if (gameState.score > bestScore) {
      saveBestScore(mode, gameState.score);
    }
    updateBestScoreDisplays();
    if (resultTitle) resultTitle.textContent = victory ? "VICTORY" : "GAME OVER";
    finalScoreText.textContent = gameState.score;
    resultBestScoreText.textContent = getBestScore(mode);
    pauseOverlay.hidden = true;
    titleReturnOverlay.hidden = true;
    resultScreen.hidden = false;
    pauseButton.textContent = "PAUSE";
    getActiveEnemyManager().stop?.();
    skills.clearAll();
  }
  document.querySelectorAll(".character-card:not(:disabled)").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".character-card").forEach((item) => item.classList.remove("is-selected"));
      card.classList.add("is-selected");
      gameState.selectedCharacter = card.dataset.character;
      player.setCharacter(gameState.selectedCharacter);
    });
  });

  startButton.addEventListener("click", () => {
    resetRun("normal");
  });
  battleRoyaleButton.addEventListener("click", () => resetRun("battleRoyale"));
  robotSelectButton.addEventListener("click", () => showTitleView("robot"));
  howToPlayButton.addEventListener("click", () => showTitleView("howto"));
  robotBackButton.addEventListener("click", () => showTitleView("menu"));
  howToPlayBackButton.addEventListener("click", () => showTitleView("menu"));

  pauseButton.addEventListener("click", togglePause);
  resumeButton.addEventListener("click", () => setPause(false));
  pauseTitleButton.addEventListener("click", requestTitleReturn);
  confirmTitleYes.addEventListener("click", returnToTitle);
  confirmTitleNo.addEventListener("click", cancelTitleReturn);
  retryButton.addEventListener("click", () => {
    resultScreen.hidden = true;
    gameState.gameOver = false;
    showTitleScreen();
  });

  function respawnPlayer() {
    if (!gameState.started || gameState.gameOver) return;
    if (gameState.mode === "battleRoyale") {
      finishGame(false);
      return;
    }
    gameState.lives -= 1;
    if (gameState.lives <= 0) {
      finishGame();
      return;
    }
    skills.clearAll();
    player.setCharacter(gameState.selectedCharacter);
    player.reset(input.view);
    enemyManager.start(player.position);
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let lastTime = performance.now();
  let lastFrameTime = lastTime;
  let lastChunkX = null;
  let lastChunkZ = null;

  function getFrameInterval() {
    const targetFps = (!gameState.started || gameState.paused || gameState.gameOver)
      ? performanceProfile.idleFps
      : performanceProfile.activeFps;
    return 1000 / Math.max(1, targetFps);
  }

  function animate(now) {
    requestAnimationFrame(animate);

    const frameInterval = getFrameInterval();
    const frameElapsed = now - lastFrameTime;
    if (frameElapsed + 0.5 < frameInterval) return;
    lastFrameTime = frameElapsed >= frameInterval
      ? now - (frameElapsed % frameInterval)
      : now;

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!gameState.started) {
      thirdPersonCamera.update(player.position, input.view.yaw, input.view.pitch);
      updateHud(player, world, renderer.domElement, getActiveEnemyManager(), gameState, now);
      renderer.render(scene, camera);
      return;
    }

    if (gameState.paused) {
      thirdPersonCamera.update(player.position, input.view.yaw, input.view.pitch);
      updateHud(player, world, renderer.domElement, getActiveEnemyManager(), gameState, now);
      renderer.render(scene, camera);
      return;
    }

    player.update(dt, input.state, input.view.yaw);
    skills.updateHeldShield(player, input.view.yaw, player.defenseType === "guardShield" && player.shieldActive);
    const activeEnemyManager = getActiveEnemyManager();
    activeEnemyManager.update(dt, player, skills, {
      onPlayerDeath: respawnPlayer,
      onEnemyDeath: handleEnemyDeath,
      onVictory: () => finishGame(true)
    });
    if (gameState.gameOver) {
      thirdPersonCamera.update(player.position, input.view.yaw, input.view.pitch);
      updateHud(player, world, renderer.domElement, activeEnemyManager, gameState, now);
      renderer.render(scene, camera);
      return;
    }
    const aliveEnemies = activeEnemyManager.getAliveEnemies();
    gameState.aliveCount = activeEnemyManager.getAliveCount?.(player) ?? 1;
    skills.update(dt, player, aliveEnemies, {
      onPlayerDeath: respawnPlayer,
      onEnemyDeath: handleEnemyDeath
    });
    if (gameState.mode === "battleRoyale" && player.hp > 0 && activeEnemyManager.getAliveEnemies().length === 0) {
      finishGame(true);
    }
    if (gameState.gameOver) {
      thirdPersonCamera.update(player.position, input.view.yaw, input.view.pitch);
      updateHud(player, world, renderer.domElement, activeEnemyManager, gameState, now);
      renderer.render(scene, camera);
      return;
    }
    const { cx, cz } = world.getChunkInfo(player.position);

    if (cx !== lastChunkX || cz !== lastChunkZ) {
      world.updateChunks(player.position);
      lastChunkX = cx;
      lastChunkZ = cz;
    }

    world.updateBackground(player.position);
    thirdPersonCamera.update(player.position, input.view.yaw, input.view.pitch);
    updateHud(player, world, renderer.domElement, activeEnemyManager, gameState, now);
    renderer.render(scene, camera);
  }

  animate(performance.now());
}

main().catch((error) => {
  console.error(error);
  const status = document.getElementById("status");
  if (status) {
    status.hidden = false;
    status.classList.remove("debug-status");
    status.textContent = "起動に失敗しました。コンソールを確認してください。";
  }
});
