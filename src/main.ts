import './styles.css';
import { Game } from './game/Game';
import { loadDeerTemplate, onLoadProgress as onDeerLoadProgress } from './entities/DeerModel';
import { getTracker } from './analytics/Tracker';
import { loadVendorTemplate, onLoadProgress as onVendorLoadProgress } from './entities/VendorModel';

// Detect the REAL input device and tag <body> so CSS shows the correct control
// hints (desktop vs touch). We deliberately do NOT rely on @media (pointer:
// coarse) here — it fails to match on some phones and responsive previews,
// which made computer-only hints (WASD / [Tab] / [E]) leak onto phones.
const isTouch =
  'ontouchstart' in window ||
  (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0);
document.body.classList.add(isTouch ? 'is-touch' : 'is-desktop');

const canvasEl = document.querySelector<HTMLCanvasElement>('#game-canvas');
const startBtn = document.getElementById('start-button');
const titleOverlay = document.getElementById('title-overlay');

if (!canvasEl) {
  throw new Error('Missing #game-canvas element.');
}

let game: Game | null = null;
let starting = false;

// Expose the game for the static wiring below so that clicks on #journal-hint
// and #share-button work *during* the loading phase, even before `Game` is
// constructed. The handlers are wired once (immediately, not after loading).
function wireUiHandlers(): void {
  const hint = document.getElementById('journal-hint');
  if (hint && !hint.classList.contains('journal-hint-clickable')) {
    hint.classList.add('journal-hint-clickable');
    const handler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (!game) {
        // Still loading — flash a hint so the player knows it isn't broken.
        startBtn?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
          { duration: 280, easing: 'ease-out' },
        );
        // Also pulse the chip so the player gets direct feedback.
        hint.animate(
          [
            { transform: 'scale(1)', background: 'rgba(255, 213, 79, 0.12)' },
            { transform: 'scale(1.04)', background: 'rgba(255, 213, 79, 0.28)' },
            { transform: 'scale(1)', background: 'rgba(255, 213, 79, 0.12)' },
          ],
          { duration: 360, easing: 'ease-out' },
        );
        return;
      }
      game.toggleJournal();
    };
    hint.addEventListener('click', handler);
    // Eat pointerdown so the canvas/camera handler doesn't also fire.
    hint.addEventListener('pointerdown', (e) => e.stopPropagation());
    hint.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  const shareBtn = document.getElementById('share-button');
  if (shareBtn && !shareBtn.dataset.wired) {
    shareBtn.dataset.wired = '1';
    const handler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (!game) return; // nothing to do until game is up
      game.doShare();
    };
    shareBtn.addEventListener('click', handler);
    shareBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}
wireUiHandlers();

// Track loading progress from both models so the player gets feedback while the
// (heavy) FBX models decode. Reports max of (deer, vendor) progress.
let deerFraction = 0;
let vendorFraction = 0;
const updateLoadLabel = (): void => {
  const combined = Math.min(1, Math.max(deerFraction, vendorFraction));
  const pct = Math.round(combined * 100);
  startBtn!.textContent = `加载中… ${pct}%`;
};

// Start loading immediately on page load (before the user clicks anything),
// so by the time the player reads the title screen and hits 开始, both FBX
// models + their textures are already in the browser cache. Previously the
// 23 MB of FBX + PNG only started downloading AFTER the click — that was the
// '点击开始很久都 0%' bug. Now the title screen shows real progress and the
// click is effectively instant.
const offDeerEarly = onDeerLoadProgress(({ fraction }) => {
  deerFraction = fraction;
  updateLoadLabel();
});
const offVendorEarly = onVendorLoadProgress(({ fraction }) => {
  vendorFraction = fraction;
  updateLoadLabel();
});
startBtn!.textContent = '加载中… 0%';

let preloadPromise: Promise<void> | null = null;
function preload(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all([loadDeerTemplate(), loadVendorTemplate()])
      .then(() => undefined)
      .catch((err) => {
        // Reset so a click can retry
        preloadPromise = null;
        throw err;
      });
  }
  return preloadPromise;
}
// Kick off the preload now (don't await — let it run in background).
preload().catch((err) => {
  console.error('Preload failed:', err);
  startBtn!.textContent = '重试';
});

async function startGame(): Promise<void> {
  if (starting) return;
  starting = true;
  // Subscribe to current progress (in case preload already finished).
  const offDeer = onDeerLoadProgress(({ fraction }) => {
    deerFraction = fraction;
    updateLoadLabel();
  });
  const offVendor = onVendorLoadProgress(({ fraction }) => {
    vendorFraction = fraction;
    updateLoadLabel();
  });
  try {
    await preload();
    if (game) game.dispose();
    game = new Game(canvasEl!);
    game.start();
    // Analytics — fire game_start once the Game is alive and bindings are
    // installed (the bindStateReader happens inside Game's constructor).
    getTracker().recordEvent('game_start');
    // Expose for the static UI handlers wired above.
    (window as unknown as { __game?: Game }).__game = game;
    titleOverlay?.classList.add('hidden');
  } catch (err) {
    console.error('Failed to start:', err);
    startBtn!.textContent = '重试';
  } finally {
    offDeer();
    offVendor();
    offDeerEarly();
    offVendorEarly();
    starting = false;
  }
}

startBtn?.addEventListener('click', startGame);

// Touch the overlay to start
titleOverlay?.addEventListener('pointerdown', (e) => {
  if (e.target === startBtn) return;
  startGame();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose();
  });
}
