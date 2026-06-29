import './styles.css';
import { Game } from './game/Game';

const canvasEl = document.querySelector<HTMLCanvasElement>('#game-canvas');
const startBtn = document.getElementById('start-button');
const restartBtn = document.getElementById('restart-button');
const titleOverlay = document.getElementById('title-overlay');

if (!canvasEl) {
  throw new Error('Missing #game-canvas element.');
}

let game: Game | null = null;

function startGame(): void {
  if (game) {
    game.dispose();
  }
  game = new Game(canvasEl!);
  game.start();
  titleOverlay?.classList.add('hidden');
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
