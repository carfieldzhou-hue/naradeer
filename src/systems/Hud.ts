export class Hud {
  private readonly scoreCount = this.getElement('#score-count');
  private readonly totalCount = this.getElement('#total-count');
  private readonly timerValue = this.getElement('#timer-value');
  private readonly statusText = this.getElement('#status-text');
  private readonly feedHint = this.getElement('#feed-hint');
  private readonly completionOverlay = this.getElement('#completion-overlay');
  private readonly completionTime = this.getElement('#completion-time');
  private readonly completionScore = this.getElement('#completion-score');

  setTarget(target: number): void {
    this.totalCount.textContent = String(target);
  }

  update(
    score: number,
    target: number,
    elapsed: number,
    complete: boolean,
    deerNearby: boolean,
  ): void {
    // Score
    this.scoreCount.textContent = String(score);

    // Timer
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = Math.floor(elapsed % 60).toString().padStart(2, '0');
    this.timerValue.textContent = `${minutes}:${seconds}`;

    // Status
    if (complete) {
      this.statusText.textContent = '✨ 所有的鹿都喂饱了！ ✨';
    } else {
      this.statusText.textContent = `找鹿喂食 · ${score}/${target}`;
    }

    // Feed hint
    if (complete) {
      this.feedHint.classList.add('hidden');
    } else if (deerNearby) {
      this.feedHint.classList.remove('hidden');
      this.feedHint.textContent = '按 E 喂鹿 🦌';
    } else {
      this.feedHint.classList.add('hidden');
    }

    // Completion overlay
    if (complete && !this.completionOverlay.classList.contains('show')) {
      this.completionOverlay.classList.add('show');
      this.completionTime.textContent = this.timerValue.textContent;
      this.completionScore.textContent = String(score);
    }
  }

  flashPickup(): void {
    this.statusText.animate(
      [
        { transform: 'translateY(0)', color: '#ffffff' },
        { transform: 'translateY(-2px)', color: '#ffd54f' },
        { transform: 'translateY(0)', color: '#ffffff' },
      ],
      { duration: 250, easing: 'ease-out' },
    );
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
