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
  private readonly moneyTreeHint = this.getElement('#money-tree-hint');
  private readonly shareButton = this.getElement('#share-button');
  private readonly levelDisplay = this.getElement('#level-display');

  setLevel(level: number, target: number): void {
    this.levelDisplay.textContent = `第 ${level} 关`;
    this.totalCount.textContent = String(target);
    this.scoreCount.textContent = '0';
  }

  setTarget(target: number): void {
    this.totalCount.textContent = String(target);
  }

  hideCompletion(): void {
    this.completionOverlay.classList.remove('show');
  }

  setShareAvailable(available: boolean): void {
    if (available) {
      this.shareButton.classList.remove('hidden');
    } else {
      this.shareButton.classList.add('hidden');
    }
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
    level?: number,
    moneyTreeNearby?: boolean,
    shareAvailable?: boolean,
  ): void {
    this.scoreCount.textContent = String(score);

    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = Math.floor(elapsed % 60).toString().padStart(2, '0');
    this.timerValue.textContent = `${minutes}:${seconds}`;

    if (crackers !== undefined) this.crackerCount.textContent = String(crackers);
    if (money !== undefined) this.moneyCount.textContent = String(money);

    if (complete) {
      this.statusText.textContent = '✨ 关卡完成！ ✨';
    } else {
      const coll = collectedCount !== undefined ? ` · 图鉴 ${collectedCount}/${target}` : '';
      this.statusText.textContent = `找鹿喂食 · ${score}/${target}${coll}`;
    }

    if (complete) {
      this.feedHint.classList.add('hidden');
    } else if (deerNearby) {
      this.feedHint.classList.remove('hidden');
      this.feedHint.textContent = '按 E 喂鹿 🦌';
    } else {
      this.feedHint.classList.add('hidden');
    }

    if (vendorNearby) {
      this.vendorHint.classList.remove('hidden');
    } else {
      this.vendorHint.classList.add('hidden');
    }

    if (moneyTreeNearby && !complete) {
      this.moneyTreeHint.classList.remove('hidden');
    } else {
      this.moneyTreeHint.classList.add('hidden');
    }

    if (shareAvailable !== undefined) {
      this.setShareAvailable(shareAvailable);
    }

    if (complete || !obstacleNearby) {
      this.jumpHint.classList.add('hidden');
    } else {
      this.jumpHint.classList.remove('hidden');
    }

    if (complete && !this.completionOverlay.classList.contains('show')) {
      this.completionOverlay.classList.add('show');
      this.completionTime.textContent = this.timerValue.textContent;
      this.completionScore.textContent = String(score);
      const titleEl = document.getElementById('level-title');
      const subtitleEl = document.getElementById('level-subtitle');
      if (titleEl) titleEl.textContent = `第 ${level ?? 1} 关 完成！`;
      if (subtitleEl) subtitleEl.textContent = '继续挑战下一关吧 🦌';
    }

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
