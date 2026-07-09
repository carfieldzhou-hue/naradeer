import * as THREE from 'three';

type PointerState = {
  active: boolean;
  id: number | null;
  centerX: number;
  centerY: number;
  radius: number;
};

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = new THREE.Vector2();
  private readonly keyVector = new THREE.Vector2();
  private readonly pointerState: PointerState = {
    active: false,
    id: null,
    centerX: 0,
    centerY: 0,
    radius: 1,
  };

  private dashDown = false;
  private cameraYaw = 0;
  private mouseButton = -1;
  private cameraPitch = 0.4;
  private touchCamId: number | null = null;
  private touchCamLastX = 0;
  private touchCamLastY = 0;

  // Window-level joystick move/end handlers
  private readonly onWindowPointerMove: (e: PointerEvent) => void;
  private readonly onWindowPointerUp: (e: PointerEvent) => void;
  private readonly onWindowTouchMove: (e: TouchEvent) => void;
  private readonly onWindowTouchEnd: (e: TouchEvent) => void;

  // A quick tap on the joystick centre (no drag) is treated as a "feed" press,
  // so one thumb can both move (drag the rim) and feed (tap the centre).
  private stickMoved = false;
  private feedCallback: (() => void) | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.dashDown = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.dashDown = false;
    }
  };

  // --- Joystick helpers ---
  private stickRect!: { left: number; top: number; width: number; height: number };

  private updateStickRect(): void {
    const r = this.stick.getBoundingClientRect();
    this.stickRect = { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  private handleStickDown(clientX: number, clientY: number, id: number): void {
    this.updateStickRect();
    this.pointerState.active = true;
    this.pointerState.id = id;
    this.pointerState.centerX = this.stickRect.left + this.stickRect.width / 2;
    this.pointerState.centerY = this.stickRect.top + this.stickRect.height / 2;
    this.pointerState.radius = this.stickRect.width * 0.42;
    this.stickMoved = false;
    this.updatePointer(clientX, clientY);
  }

  private handleStickUp(id: number): void {
    if (id !== this.pointerState.id) return;
    const wasTap = !this.stickMoved;
    this.pointerState.active = false;
    this.pointerState.id = null;
    this.stickMoved = false;
    this.pointer.set(0, 0);
    this.updateKnob();
    // A tap that never left the dead-zone feeds; a drag just moved the player.
    if (wasTap && this.feedCallback) this.feedCallback();
  }

  // --- Joystick: start on element, move/end on window ---
  private readonly onStickDown = (event: PointerEvent) => {
    event.preventDefault();
    this.handleStickDown(event.clientX, event.clientY, event.pointerId);
  };

  private readonly onStickTouchStart = (event: TouchEvent) => {
    if (event.touches.length > 0) {
      const t = event.touches[0];
      this.handleStickDown(t.clientX, t.clientY, t.identifier);
    }
  };

  // --- Mouse camera rotation ---
  private readonly onMouseDown = (event: MouseEvent) => {
    this.mouseButton = event.button;
  };

  private readonly onMouseMove = (event: MouseEvent) => {
    if (this.mouseButton >= 0) {
      this.cameraYaw -= event.movementX * 0.005;
      this.cameraPitch = Math.max(0.1, Math.min(1.2, this.cameraPitch + event.movementY * 0.005));
    }
  };

  private readonly onMouseUp = (_event: MouseEvent) => {
    this.mouseButton = -1;
  };

  // Touch camera: window-level, start on any touch outside controls
  private readonly onWindowPointerDown = (e: PointerEvent) => {
    const target = e.target as Element | null;
    // `closest` exists on Element but not on Text/Window/Document. Be defensive
    // so a stray target type can't throw and silently kill the camera handler.
    const inTouchControls =
      target && typeof (target as Element).closest === 'function' &&
      (target as Element).closest('#touch-controls') !== null;
    if (inTouchControls) return;
    if (this.touchCamId !== null) return;
    this.touchCamId = e.pointerId;
    this.touchCamLastX = e.clientX;
    this.touchCamLastY = e.clientY;
  };

  // Some mobile browsers (notably old WeChat X5 / older Android Chromium) only
  // emit `touchstart`/`touchmove` for the first finger and never synthesize
  // PointerEvents. Provide a parallel path that tracks the *first* finger
  // anywhere on screen, mirroring the PointerEvent handler above.
  private touchOnlyCamId: number | null = null;
  private touchOnlyLastX = 0;
  private touchOnlyLastY = 0;
  private readonly isInTouchControls = (clientX: number, clientY: number): boolean => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return false;
    const close = (el as Element).closest?.bind(el) as ((s: string) => Element | null) | undefined;
    return typeof close === 'function' ? close('#touch-controls') !== null : false;
  };
  private readonly onWindowTouchStart = (e: TouchEvent) => {
    if (this.touchCamId !== null || this.touchOnlyCamId !== null) return;
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    if (this.isInTouchControls(t.clientX, t.clientY)) return;
    this.touchOnlyCamId = t.identifier;
    this.touchOnlyLastX = t.clientX;
    this.touchOnlyLastY = t.clientY;
  };
  private readonly onWindowTouchMoveOnly = (e: TouchEvent) => {
    if (this.touchOnlyCamId === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.identifier !== this.touchOnlyCamId) continue;
      const dx = t.clientX - this.touchOnlyLastX;
      const dy = t.clientY - this.touchOnlyLastY;
      this.cameraYaw -= dx * 0.005;
      this.cameraPitch = Math.max(0.1, Math.min(1.2, this.cameraPitch - dy * 0.005));
      this.touchOnlyLastX = t.clientX;
      this.touchOnlyLastY = t.clientY;
      break;
    }
  };
  private readonly onWindowTouchEndOnly = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.touchOnlyCamId) {
        this.touchOnlyCamId = null;
        return;
      }
    }
  };

  private cameraMove(clientX: number, clientY: number): void {
    const dx = clientX - this.touchCamLastX;
    const dy = clientY - this.touchCamLastY;
    this.cameraYaw -= dx * 0.005;
    this.cameraPitch = Math.max(0.1, Math.min(1.2, this.cameraPitch - dy * 0.005));
    this.touchCamLastX = clientX;
    this.touchCamLastY = clientY;
  }

  constructor(
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
  ) {
    // Bind window-level joystick + camera handlers
    this.onWindowPointerMove = (e: PointerEvent) => {
      if (this.pointerState.active && e.pointerId === this.pointerState.id) {
        e.preventDefault();
        this.updatePointer(e.clientX, e.clientY);
        return;
      }
      if (e.pointerId === this.touchCamId) {
        this.cameraMove(e.clientX, e.clientY);
      }
    };
    this.onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerId === this.pointerState.id) {
        this.handleStickUp(e.pointerId);
        return;
      }
      if (e.pointerId === this.touchCamId) {
        this.touchCamId = null;
      }
    };
    this.onWindowTouchMove = (e: TouchEvent) => {
      if (!this.pointerState.active || e.touches.length === 0) return;
      const t = e.touches[0];
      if (t.identifier !== this.pointerState.id) return;
      this.updatePointer(t.clientX, t.clientY);
    };
    this.onWindowTouchEnd = (e: TouchEvent) => {
      if (this.pointerState.id === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.pointerState.id) {
          this.handleStickUp(this.pointerState.id);
          break;
        }
      }
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    // Mouse camera rotation
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);

    // Touch camera rotation (window-level, catches canvas touches reliably)
    window.addEventListener('pointerdown', this.onWindowPointerDown);

    // Joystick
    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('touchstart', this.onStickTouchStart, { passive: true });
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('pointercancel', this.onWindowPointerUp);
    window.addEventListener('touchmove', this.onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', this.onWindowTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.onWindowTouchEnd, { passive: true });

    // Fallback for browsers that don't synthesize PointerEvents (older WeChat
    // X5, some Android WebViews). Use touch events directly for camera drag.
    window.addEventListener('touchstart', this.onWindowTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onWindowTouchMoveOnly, { passive: true });
    window.addEventListener('touchend', this.onWindowTouchEndOnly, { passive: true });
    window.addEventListener('touchcancel', this.onWindowTouchEndOnly, { passive: true });
  }

  getCameraYaw(): number {
    return this.cameraYaw;
  }

  setFeedCallback(cb: () => void): void {
    this.feedCallback = cb;
  }

  getCameraPitch(): number {
    return this.cameraPitch;
  }

  readMovement(target: THREE.Vector2): THREE.Vector2 {
    this.keyVector.set(0, 0);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.keyVector.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.keyVector.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.keyVector.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.keyVector.y += 1;

    target.copy(this.keyVector).add(this.pointer);
    if (target.lengthSq() > 1) target.normalize();
    return target;
  }

  isDashHeld(): boolean {
    return this.dashDown;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);

    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);

    window.removeEventListener('pointerdown', this.onWindowPointerDown);

    this.stick.removeEventListener('pointerdown', this.onStickDown);
    this.stick.removeEventListener('touchstart', this.onStickTouchStart);

    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerUp);
    window.removeEventListener('touchmove', this.onWindowTouchMove);
    window.removeEventListener('touchend', this.onWindowTouchEnd);
    window.removeEventListener('touchcancel', this.onWindowTouchEnd);
  }

  private updatePointer(clientX: number, clientY: number): void {
    const dx = clientX - this.pointerState.centerX;
    const dy = clientY - this.pointerState.centerY;
    this.pointer.set(dx / this.pointerState.radius, dy / this.pointerState.radius);
    if (this.pointer.lengthSq() > 1) this.pointer.normalize();
    // Flag a real drag so a centre tap isn't mistaken for movement.
    if (this.pointer.lengthSq() > 0.09) this.stickMoved = true;
    this.updateKnob();
  }

  private updateKnob(): void {
    const distance = 38;
    this.knob.style.transform = `translate(calc(-50% + ${this.pointer.x * distance}px), calc(-50% + ${this.pointer.y * distance}px))`;
  }
}
