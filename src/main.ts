import './styles.css';
import { Game } from './game/Game';
import { loadDeerTemplate, onLoadProgress as onDeerLoadProgress } from './entities/DeerModel';
import { loadVendorTemplate, onLoadProgress as onVendorLoadProgress } from './entities/VendorModel';

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
      game.journal.toggle();
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

async function startGame(): Promise<void> {
  if (starting) return;
  starting = true;
  startBtn!.textContent = '加载中… 0%';
  const offDeer = onDeerLoadProgress(({ fraction }) => {
    deerFraction = fraction;
    updateLoadLabel();
  });
  const offVendor = onVendorLoadProgress(({ fraction }) => {
    vendorFraction = fraction;
    updateLoadLabel();
  });
  try {
    await Promise.all([loadDeerTemplate(), loadVendorTemplate()]);
    if (game) game.dispose();
    game = new Game(canvasEl!);
    game.start();
    // Expose for the static UI handlers wired above.
    (window as unknown as { __game?: Game }).__game = game;
    titleOverlay?.classList.add('hidden');
  } catch (err) {
    console.error('Failed to start:', err);
    startBtn!.textContent = '重试';
  } finally {
    offDeer();
    offVendor();
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
