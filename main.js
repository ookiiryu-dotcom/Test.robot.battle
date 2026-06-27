import * as THREE from "three";
import { EnemyManager } from "./enemy.js";
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

function createRenderer(config) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.renderer.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

function addLights(scene, config) {
  const lights = config.lights;
  const hemiLight = new THREE.HemisphereLight(
    colorFromHex(lights.hemisphereSky),
    colorFromHex(lights.hemisphereGround),
    lights.hemisphereIntensity
  );
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(colorFromHex(lights.sunColor), lights.sunIntensity);
  sunLight.position.set(...lights.sunPosition);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.left = -180;
  sunLight.shadow.camera.right = 180;
  sunLight.shadow.camera.top = 180;
  sunLight.shadow.camera.bottom = -180;
  scene.add(sunLight);

  const coreLight = new THREE.PointLight(colorFromHex(lights.coreColor), lights.coreIntensity, lights.coreDistance);
  coreLight.position.set(...lights.corePosition);
  scene.add(coreLight);
}

function updateHud(player, world, rendererElement, enemyManager, gameState) {
  const status = document.getElementById("status");
  const centerMessage = document.getElementById("centerMessage");
  const playerHpFill = document.getElementById("playerHpFill");
  const playerHpText = document.getElementById("playerHpText");
  const enemyHpList = document.getElementById("enemyHpList");
  const livesText = document.getElementById("livesText");
  const scoreText = document.getElementById("scoreText");
  const modeText = document.getElementById("modeText");
  const ascendMeter = document.getElementById("ascendMeter");
  const ascendMeterFill = document.getElementById("ascendMeterFill");
  const ascendMeterText = document.getElementById("ascendMeterText");
  const { cx, cz, chunkCount } = world.getChunkInfo(player.position);
  const playerHpRate = Math.max(0, player.hp / player.maxHp);

  playerHpFill.style.width = `${playerHpRate * 100}%`;
  playerHpText.textContent = `${player.hp}/${player.maxHp}`;
  livesText.textContent = gameState.lives;
  scoreText.textContent = gameState.score;
  modeText.textContent = gameState.paused
    ? "PAUSE"
    : gameState.started
      ? "RUN"
      : "READY";

  if (ascendMeter && ascendMeterFill && ascendMeterText) {
    // The vertical meter shows usable ascend time, then fills back up during cooldown.
    const ascendStatus = player.getAscendStatus();
    const fillRate = Math.max(0, Math.min(1, ascendStatus.fillRate));
    ascendMeter.classList.toggle("is-cooldown", ascendStatus.coolingDown);
    ascendMeterFill.style.height = `${fillRate * 100}%`;
    ascendMeterText.textContent = ascendStatus.coolingDown
      ? `${Math.ceil(ascendStatus.cooldownRemaining)}s`
      : `${Math.ceil(ascendStatus.timeRemaining)}s`;
  }

  const currentEnemy = enemyManager.getActiveEnemy();
  const visibleEnemies = currentEnemy ? [currentEnemy] : [];
  enemyHpList.innerHTML = visibleEnemies.map((enemy) => {
    const enemyHpRate = Math.max(0, enemy.hp / enemy.maxHp);
    return `
      <div class="hp-row">
        <span>${enemy.displayName}</span>
        <div class="hp-bar"><div class="hp-fill ${enemy.typeId}" style="width: ${enemyHpRate * 100}%"></div></div>
        <strong>${enemy.hp}/${enemy.maxHp}</strong>
      </div>
    `;
  }).join("");

  status.textContent = `X:${player.position.x.toFixed(1)} Y:${player.position.y.toFixed(1)} Z:${player.position.z.toFixed(1)} / Chunk:${cx},${cz} / ${chunkCount} chunks`;

  if (document.pointerLockElement === rendererElement) {
    centerMessage.style.display = "none";
  } else if (window.innerWidth > 800 && window.matchMedia("(pointer: fine)").matches) {
    centerMessage.style.display = "grid";
  }
}

async function main() {
  const config = await loadConfig();
  const scene = createScene(config);
  const camera = new THREE.PerspectiveCamera(
    config.camera.fov,
    window.innerWidth / window.innerHeight,
    config.camera.near,
    config.camera.far
  );
  const renderer = createRenderer(config);

  addLights(scene, config);

  const world = new World(scene, config);
  const player = new Player(scene, config, world);
  const enemyManager = new EnemyManager(scene, config, world);
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
      if (gameState.started && !gameState.paused && !gameState.gameOver) {
        if (action === "shoot") {
          player.faceYaw(input.view.yaw);
          skills.shootAt(player, thirdPersonCamera.getAimTarget(player.position, input.view.yaw), "player", 0xfff4a3);
          return;
        }

        if (action === "shield") {
          // Place the shield toward the center reticle, matching the same aim direction as shooting.
          player.faceYaw(input.view.yaw);
          skills.trigger(action, player, input.view.yaw);
          return;
        }

        // Other body-based actions still use the current character facing direction.
        const actionYaw = action === "mine" ? player.facingYaw : input.view.yaw;
        skills.trigger(action, player, actionYaw);
      }
    }
  );
  const thirdPersonCamera = new ThirdPersonCamera(camera, config);

  player.reset(input.view);
  world.createBarriers();
  world.updateChunks(player.position);
  enemyManager.start(player.position);

  const gameState = {
    started: false,
    paused: false,
    gameOver: false,
    selectedCharacter: "runner",
    lives: 3,
    score: 0,
    bestScore: Number(localStorage.getItem("humanoidRunnerBestScore") || 0)
  };

  const startScreen = document.getElementById("startScreen");
  const startButton = document.getElementById("startButton");
  const titleBestScore = document.getElementById("titleBestScore");
  const pauseButton = document.getElementById("pauseButton");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeButton = document.getElementById("resumeButton");
  const resultScreen = document.getElementById("resultScreen");
  const retryButton = document.getElementById("retryButton");
  const finalScoreText = document.getElementById("finalScoreText");
  const resultBestScoreText = document.getElementById("resultBestScoreText");
  titleBestScore.textContent = gameState.bestScore;

  function setPause(paused) {
    if (!gameState.started || gameState.gameOver) return;
    gameState.paused = paused;
    pauseOverlay.hidden = !paused;
    pauseButton.textContent = paused ? "RESUME" : "PAUSE";
  }

  function togglePause() {
    setPause(!gameState.paused);
  }

  function resetRun() {
    gameState.started = true;
    gameState.paused = false;
    gameState.gameOver = false;
    gameState.lives = 3;
    gameState.score = 0;
    skills.clearAll();
    player.reset(input.view);
    enemyManager.start(player.position);
    startScreen.style.display = "none";
    pauseOverlay.hidden = true;
    resultScreen.hidden = true;
    pauseButton.textContent = "PAUSE";
  }

  function finishGame() {
    gameState.started = false;
    gameState.paused = false;
    gameState.gameOver = true;
    if (gameState.score > gameState.bestScore) {
      gameState.bestScore = gameState.score;
      localStorage.setItem("humanoidRunnerBestScore", String(gameState.bestScore));
    }
    titleBestScore.textContent = gameState.bestScore;
    finalScoreText.textContent = gameState.score;
    resultBestScoreText.textContent = gameState.bestScore;
    pauseOverlay.hidden = true;
    resultScreen.hidden = false;
    pauseButton.textContent = "PAUSE";
    skills.clearAll();
  }
  document.querySelectorAll(".character-card:not(:disabled)").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".character-card").forEach((item) => item.classList.remove("is-selected"));
      card.classList.add("is-selected");
      gameState.selectedCharacter = card.dataset.character;
    });
  });

  startButton.addEventListener("click", () => {
    resetRun();
  });

  pauseButton.addEventListener("click", togglePause);
  resumeButton.addEventListener("click", () => setPause(false));
  retryButton.addEventListener("click", () => {
    resultScreen.hidden = true;
    startScreen.style.display = "grid";
    gameState.gameOver = false;
    titleBestScore.textContent = gameState.bestScore;
  });

  function respawnPlayer() {
    if (!gameState.started || gameState.gameOver) return;
    gameState.lives -= 1;
    if (gameState.lives <= 0) {
      finishGame();
      return;
    }
    skills.clearAll();
    player.reset(input.view);
    enemyManager.start(player.position);
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let lastTime = performance.now();
  let lastChunkX = null;
  let lastChunkZ = null;

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!gameState.started) {
      thirdPersonCamera.update(player.position, input.view.yaw, input.view.pitch);
      updateHud(player, world, renderer.domElement, enemyManager, gameState);
      renderer.render(scene, camera);
      return;
    }

    if (gameState.paused) {
      thirdPersonCamera.update(player.position, input.view.yaw, input.view.pitch);
      updateHud(player, world, renderer.domElement, enemyManager, gameState);
      renderer.render(scene, camera);
      return;
    }

    player.update(dt, input.state, input.view.yaw);
    enemyManager.update(dt, player, skills, {
      onPlayerDeath: respawnPlayer
    });
    skills.update(dt, player, enemyManager.getAliveEnemies(), {
      onPlayerDeath: respawnPlayer,
      onEnemyDeath: (enemy) => {
        gameState.score += 1;
        enemyManager.handleEnemyDeath(enemy);
      }
    });
    const { cx, cz } = world.getChunkInfo(player.position);

    if (cx !== lastChunkX || cz !== lastChunkZ) {
      world.updateChunks(player.position);
      lastChunkX = cx;
      lastChunkZ = cz;
    }

    world.updateBackground(player.position);
    thirdPersonCamera.update(player.position, input.view.yaw, input.view.pitch);
    updateHud(player, world, renderer.domElement, enemyManager, gameState);
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
