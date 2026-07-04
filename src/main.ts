import './styles.css';
import { Game } from './game/Game';
import { loadDeerTemplate } from './entities/DeerModel';

const canvasEl = document.querySelector<HTMLCanvasElement>('#game-canvas');
const startBtn = document.getElementById('start-button');
const restartBtn = document.getElementById('restart-button');
const titleOverlay = document.getElementById('title-overlay');

if (!canvasEl) {
  throw new Error('Missing #game-canvas element.');
}

let game: Game | null = null;
let starting = false;

async function startGame(): Promise<void> {
  if (starting) return;
  starting = true;
  startBtn!.textContent = '加载中…';
  try {
    await loadDeerTemplate();
    if (game) game.dispose();
    game = new Game(canvasEl!);
    game.start();
    titleOverlay?.classList.add('hidden');
  } catch (err) {
    console.error('Failed to start:', err);
    startBtn!.textContent = '重试';
  } finally {
    starting = false;
  }
}

startBtn?.addEventListener('click', startGame);
restartBtn?.addEventListener('click', () => {
  const overlay = document.getElementById('completion-overlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  startGame();
});

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
