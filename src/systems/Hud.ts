export class Hud {
  private readonly scoreCount = this.getElement('#score-count');
  private readonly totalCount = this.getElement('#total-count');
  private readonly timerValue = this.getElement('#timer-value');
  private readonly statusText = this.getElement('#status-text');
  private readonly feedHint = this.getElement('#feed-hint');
  private readonly jumpHint = this.getElement('#jump-hint');
  private readonly completionOverlay = this.getElement('#completion-overlay');
  private readonly completionTime = this.getElement('#completion-time');
  private readonly completionScore = this.getElement('#completion-score');
  private readonly crackerCount = this.getElement('#cracker-count');
  private readonly moneyCount = this.getElement('#money-count');
  private readonly vendorHint = this.getElement('#vendor-hint');

  setTarget(target: number): void {
    this.totalCount.textContent = String(target);
  }

  update(
    score: number,
    target: number,
    elapsed: number,
    complete: boolean,
    deerNearby: boolean,
    collectedCount?: number,
    obstacleNearby?: boolean,
    crackers?: number,
    money?: number,
    vendorNearby?: boolean,
  ): void {
    // Score
    this.scoreCount.textContent = String(score);

    // Timer
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = Math.floor(elapsed % 60).toString().padStart(2, '0');
    this.timerValue.textContent = `${minutes}:${seconds}`;

    // Cracker count and money
    if (crackers !== undefined) this.crackerCount.textContent = String(crackers);
    if (money !== undefined) this.moneyCount.textContent = String(money);

    // Status
    if (complete) {
      this.statusText.textContent = '✨ 所有的鹿都喂饱了！ ✨';
    } else {
      const coll = collectedCount !== undefined ? ` · 图鉴 ${collectedCount}/${target}` : '';
      this.statusText.textContent = `找鹿喂食 · ${score}/${target}${coll}`;
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

    // Vendor hint
    if (vendorNearby) {
      this.vendorHint.classList.remove('hidden');
    } else {
      this.vendorHint.classList.add('hidden');
    }

    // Jump hint
    if (complete || !obstacleNearby) {
      this.jumpHint.classList.add('hidden');
    } else {
      this.jumpHint.classList.remove('hidden');
    }

    // Completion overlay
    if (complete && !this.completionOverlay.classList.contains('show')) {
      this.completionOverlay.classList.add('show');
      this.completionTime.textContent = this.timerValue.textContent;
      this.completionScore.textContent = String(score);
    }

    // Journal hint
    const journalHint = this.getElement('#journal-hint');
    if (!complete && collectedCount !== undefined && collectedCount > 0 && journalHint) {
      journalHint.classList.remove('hidden');
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

  showToast(msg: string, duration = 2000): void {
    const el = this.getElement('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('hidden');
    }, duration);
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
