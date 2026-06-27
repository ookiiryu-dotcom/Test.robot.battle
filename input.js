import { clamp } from "./utils.js";

export class InputController {
  constructor(rendererElement, config, onReset, onAction) {
    this.rendererElement = rendererElement;
    this.config = config;
    this.onReset = onReset;
    this.onAction = onAction;
    this.state = {
      forward: false,
      back: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      up: false,
      shield: false,
      stickX: 0,
      stickY: 0
    };
    this.view = {
      yaw: 0,
      pitch: config.input.initialPitch
    };
    this.lastTouchX = null;
    this.lastTouchY = null;
    this.lastLookX = null;
    this.lastLookY = null;
    this.stickPointerId = null;
    this.lookPointerId = null;
    this.activeInputs = new Map();
    this.jumpHoldTimers = new Map();

    this.bindKeyboard();
    this.bindMouse();
    this.bindMobileButtons();
    this.bindVirtualStick();
    this.bindTouchLook();
    this.bindRotateOverlay();
    this.bindInputSafetyReset();
  }

  getInputSources(name) {
    if (!this.activeInputs.has(name)) {
      this.activeInputs.set(name, new Set());
    }
    return this.activeInputs.get(name);
  }

  isInputSourceActive(name, source) {
    return this.activeInputs.get(name)?.has(source) ?? false;
  }

  setInput(name, source, active) {
    const sources = this.getInputSources(name);
    if (active) {
      sources.add(source);
    } else {
      sources.delete(source);
    }
    this.state[name] = sources.size > 0;
  }

  startJumpHold(source) {
    window.clearTimeout(this.jumpHoldTimers.get(source));
    const timer = window.setTimeout(() => {
      if (this.isInputSourceActive("jump", source)) {
        this.setInput("up", `${source}:hold`, true);
      }
      this.jumpHoldTimers.delete(source);
    }, 150);
    this.jumpHoldTimers.set(source, timer);
  }

  stopJumpHold(source) {
    window.clearTimeout(this.jumpHoldTimers.get(source));
    this.jumpHoldTimers.delete(source);
    this.setInput("up", `${source}:hold`, false);
  }

  setJumpInput(source, active) {
    const wasActive = this.isInputSourceActive("jump", source);
    this.setInput("jump", source, active);

    if (active && !wasActive) {
      this.startJumpHold(source);
    } else if (!active) {
      this.stopJumpHold(source);
    }
  }

  clearHeldInputs() {
    for (const timer of this.jumpHoldTimers.values()) {
      window.clearTimeout(timer);
    }
    this.jumpHoldTimers.clear();
    this.activeInputs.clear();
    this.state.forward = false;
    this.state.back = false;
    this.state.left = false;
    this.state.right = false;
    this.state.jump = false;
    this.state.sprint = false;
    this.state.up = false;
    this.state.shield = false;
    this.state.stickX = 0;
    this.state.stickY = 0;
    this.stickPointerId = null;
    this.lookPointerId = null;
    this.lastLookX = null;
    this.lastLookY = null;

    const knob = document.getElementById("stickKnob");
    if (knob) knob.style.transform = "translate(-50%, -50%)";
    document.querySelectorAll(".is-active").forEach((button) => button.classList.remove("is-active"));
  }

  bindInputSafetyReset() {
    // ブラウザの通知・タブ切り替えなどで pointerup / keyup が届かない時に、上昇入力が残り続けないようにする。
    window.addEventListener("blur", () => this.clearHeldInputs());
    window.addEventListener("pagehide", () => this.clearHeldInputs());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clearHeldInputs();
    });
  }

  bindKeyboard() {
    const keyMap = {
      KeyW: "forward",
      ArrowUp: "forward",
      KeyS: "back",
      ArrowDown: "back",
      KeyA: "left",
      ArrowLeft: "left",
      KeyD: "right",
      ArrowRight: "right",
      Space: "jump",
      ShiftLeft: "sprint",
      ShiftRight: "sprint",
      KeyE: "up",
      Digit3: "up"
    };

    const actionMap = {
      Digit1: "shoot",
      KeyJ: "shoot",
      Digit2: "shield",
      KeyQ: "shield",
      Digit4: "special",
      KeyF: "special",
      KeyP: "pause"
    };

    window.addEventListener("keydown", (event) => {
      if (keyMap[event.code]) {
        const name = keyMap[event.code];
        if (name === "jump") {
          this.setJumpInput(`key:${event.code}`, true);
        } else {
          this.setInput(name, `key:${event.code}`, true);
        }
        event.preventDefault();
      }

      if (event.code === "KeyR") {
        this.onReset();
        event.preventDefault();
      }

      if (event.code === "Escape" && !event.repeat) {
        this.onAction("pause");
      }

      if (actionMap[event.code] && !event.repeat) {
        this.onAction(actionMap[event.code]);
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", (event) => {
      if (keyMap[event.code]) {
        const name = keyMap[event.code];
        if (name === "jump") {
          this.setJumpInput(`key:${event.code}`, false);
        } else {
          this.setInput(name, `key:${event.code}`, false);
        }
        event.preventDefault();
      }
    });
  }

  bindMouse() {
    this.rendererElement.addEventListener("click", () => {
      if (window.innerWidth > 800 && window.matchMedia("(pointer: fine)").matches) {
        this.rendererElement.requestPointerLock();
      }
    });

    document.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement === this.rendererElement) {
        // Pointer-lock mouse orbit needs the opposite sign from mobile drag for this camera setup.
        this.view.yaw -= event.movementX * this.config.input.mouseSensitivity;
        this.view.pitch -= event.movementY * this.config.input.mouseSensitivity;
        this.view.pitch = clamp(this.view.pitch, this.config.input.minPitch, this.config.input.maxPitch);
      }
    });

    this.rendererElement.addEventListener("mousedown", (event) => {
      if (event.button === 0 && document.pointerLockElement === this.rendererElement) {
        this.onAction("shoot");
      }
    });
  }

  bindMobileButtons() {
    document.querySelectorAll("[data-input]").forEach((button) => {
      const name = button.dataset.input;
      const source = `button:${name}`;

      const setPressed = (pressed) => {
        button.classList.toggle("is-active", pressed);
        if (name === "jump") {
          this.setJumpInput(source, pressed);
        } else {
          this.setInput(name, source, pressed);
        }
      };

      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        setPressed(true);
      });

      button.addEventListener("pointerup", (event) => {
        event.preventDefault();
        setPressed(false);
      });

      button.addEventListener("pointercancel", (event) => {
        event.preventDefault();
        setPressed(false);
      });

      button.addEventListener("lostpointercapture", () => {
        setPressed(false);
      });
    });

    document.querySelectorAll("[data-action]").forEach((button) => {
      const release = () => button.classList.remove("is-active");

      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.classList.add("is-active");
        button.setPointerCapture?.(event.pointerId);
        this.handleAction(button.dataset.action);
      });

      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    });
  }

  bindVirtualStick() {
    const stick = document.getElementById("moveStick");
    const knob = document.getElementById("stickKnob");
    if (!stick || !knob) return;

    const resetStick = () => {
      this.stickPointerId = null;
      this.state.stickX = 0;
      this.state.stickY = 0;
      knob.style.transform = "translate(-50%, -50%)";
    };

    const updateStick = (event) => {
      const rect = stick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxDistance = Math.min(rect.width, rect.height) * 0.34;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
      const angle = Math.atan2(dy, dx);
      const knobX = Math.cos(angle) * distance;
      const knobY = Math.sin(angle) * distance;

      // Mobile stick uses the opposite sign from the digital A/D mapping in player.js.
      // Flip only this touch value so dragging left moves left and dragging right moves right.
      this.state.stickX = maxDistance > 0 ? -knobX / maxDistance : 0;
      // Screen Y grows downward, so the sign is flipped to make upward stick movement mean forward.
      this.state.stickY = maxDistance > 0 ? -knobY / maxDistance : 0;
      knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
    };

    stick.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.stickPointerId = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      updateStick(event);
    });

    stick.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.stickPointerId) return;
      event.preventDefault();
      updateStick(event);
    });

    stick.addEventListener("pointerup", (event) => {
      if (event.pointerId === this.stickPointerId) resetStick();
    });

    stick.addEventListener("pointercancel", (event) => {
      if (event.pointerId === this.stickPointerId) resetStick();
    });
  }

  bindTouchLook() {
    const resetLook = () => {
      this.lookPointerId = null;
      this.lastLookX = null;
      this.lastLookY = null;
    };

    this.rendererElement.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || event.clientX < window.innerWidth * 0.36) {
        return;
      }
      event.preventDefault();
      this.lookPointerId = event.pointerId;
      this.lastLookX = event.clientX;
      this.lastLookY = event.clientY;
      this.rendererElement.setPointerCapture?.(event.pointerId);
    });

    this.rendererElement.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.lookPointerId || this.lastLookX === null) return;
      event.preventDefault();

      const dx = event.clientX - this.lastLookX;
      const dy = event.clientY - this.lastLookY;

      // On touch screens, moving the finger right should rotate the view to the right.
      // The camera orbit uses the opposite sign from raw screen movement, so yaw is reduced here.
      this.view.yaw -= dx * this.config.input.touchSensitivity;
      this.view.pitch -= dy * this.config.input.touchSensitivity;
      this.view.pitch = clamp(this.view.pitch, this.config.input.minPitch, this.config.input.maxPitch);

      this.lastLookX = event.clientX;
      this.lastLookY = event.clientY;
    });

    this.rendererElement.addEventListener("pointerup", (event) => {
      if (event.pointerId === this.lookPointerId) resetLook();
    });

    this.rendererElement.addEventListener("pointercancel", (event) => {
      if (event.pointerId === this.lookPointerId) resetLook();
    });
  }

  bindRotateOverlay() {
    const rotateOverlay = document.getElementById("rotateOverlay");
    if (!rotateOverlay) return;
    rotateOverlay.addEventListener("click", () => this.requestLandscapeLock());
    rotateOverlay.addEventListener("touchstart", (event) => {
      event.preventDefault();
      this.requestLandscapeLock();
    });
  }

  handleAction(action) {
    if (action === "reset") this.onReset();
    if (action === "lock") this.requestLandscapeLock();
    if (["shoot", "shield", "ascend", "mine", "special", "pause", "title"].includes(action)) {
      this.onAction(action);
    }
  }

  async requestLandscapeLock() {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      if (screen.orientation?.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch (error) {
      // Some mobile browsers only allow manual rotation; the overlay still blocks portrait play.
    }
  }
}
