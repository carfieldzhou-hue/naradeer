export class Hud {
  private readonly scoreCount = this.getElement('#score-count');
  private readonly totalCount = this.getElement('#total-count');
  private readonly timerValue = this.getElement('#timer-value');
  private readonly statusText = this.getElement('#status-text');
  private readonly feedHint = this.getElement('#feed-hint');
  private readonly completionOverlay = this.getElement('#completion-overlay');
  private readonly completionTime = this.getElement('#completion-time');
  private readonly completionScore = this.getElement('#completion-score');
  private readonly crackerCount = this.getElement('#cracker-count');
  private readonly moneyCount = this.getElement('#money-count');
  private readonly vendorHint = this.getElement('#vendor-hint');
  private readonly moneyTreeHint = this.getElement('#money-tree-hint');
  private readonly shareButton = this.getElement('#share-button');
  private readonly levelDisplay = this.getElement('#level-display');
  private journalHintTextSet = false;

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
    this.completionOverlay.classList.add('hidden');
  }

  setShareAvailable(available: boolean): void {
    this.shareButton.style.display = available ? 'block' : 'none';
  }

  update(
    score: number,
    target: number,
    elapsed: number,
    complete: boolean,
    deerNearby: boolean,
    collectedCount?: number,
    _obstacleNearby?: boolean,
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
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      this.feedHint.textContent = isTouch ? '喂鹿 🦌' : '按 E 喂鹿 🦌';
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

    if (complete && !this.completionOverlay.classList.contains('show')) {
      this.completionOverlay.classList.remove('hidden');
      this.completionOverlay.classList.add('show');
      this.completionTime.textContent = this.timerValue.textContent;
      this.completionScore.textContent = String(score);
      const titleEl = document.getElementById('level-title');
      const subtitleEl = document.getElementById('level-subtitle');
      if (titleEl) titleEl.textContent = `第 ${level ?? 1} 关 完成！`;
      if (subtitleEl) subtitleEl.textContent = '继续挑战下一关吧 🦌';
      // Hide the HUD share button while overlay is shown
      this.shareButton.style.display = 'none';
    }

    const journalHint = this.getElement('#journal-hint');
    // Touch-only devices have no Tab key, so always show the journal hint
    // entry. Desktop users still get the same chip once they've collected at
    // least one deer (matches the original "reward loop" intent).
    const isTouchOnly = document.body.classList.contains('is-touch');
    // Set the hint copy ONCE based on the real input device, so phones never
    // show a "press Tab" instruction that has no key to press.
    if (journalHint && !this.journalHintTextSet) {
      journalHint.innerHTML = isTouchOnly
        ? '<span class="mobile-only">📖 点击打开鹿图鉴</span>'
        : '<span class="desktop-only">📖 按 [Tab] 打开鹿图鉴</span>';
      this.journalHintTextSet = true;
    }
    const shouldShowHint =
      !!journalHint &&
      !complete &&
      (isTouchOnly || (collectedCount !== undefined && collectedCount > 0));
    if (shouldShowHint) {
      journalHint.classList.remove('hidden');
    } else if (journalHint) {
      journalHint.classList.add('hidden');
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

  /** Show / hide the deer-radar arrow. Pass a screen-space angle in degrees
   *  (0 = up, 90 = right) or null to hide it. */
  setRadar(angleDeg: number | null): void {
    const el = document.getElementById('radar-arrow');
    if (!el) return;
    if (angleDeg === null) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
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
