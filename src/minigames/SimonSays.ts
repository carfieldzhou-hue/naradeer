const COLORS = ['#e53935', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa', '#00acc1'];
const COLOR_KEYS = ['1', '2', '3', '4', '5', '6'];

export class SimonSays {
  private container: HTMLDivElement;
  private sequence: number[] = [];
  private playerStep = 0;
  private isShowing = false;
  private isPlaying = false;
  private completed = false;
  private onComplete: (() => void) | null = null;
  private stepCount = 6;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'simon-overlay';
    this.container.className = 'hidden';
    this.container.innerHTML = `
      <div class="simon-backdrop"></div>
      <div class="simon-panel">
        <h2 class="simon-title">🔧 修复神社</h2>
        <p class="simon-instruction" id="simon-instruction">记住颜色顺序！</p>
        <div class="simon-grid" id="simon-grid">
          ${COLORS.map((c, i) => `
            <div class="simon-btn" data-index="${i}" style="background:${c};opacity:0.4;">
              <span class="simon-key">${COLOR_KEYS[i]}</span>
            </div>
          `).join('')}
        </div>
        <div class="simon-progress" id="simon-progress"></div>
        <div class="simon-footer">
          <span class="simon-hint">按数字键 1-6 或点击颜色</span>
        </div>
      </div>
    `;
    document.body.appendChild(this.container);

    this.container.querySelectorAll('.simon-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.index!, 10);
        this.handleInput(idx);
      });
    });
  }

  start(onComplete: () => void): void {
    this.onComplete = onComplete;
    this.completed = false;
    this.sequence = [];
    this.playerStep = 0;
    this.stepCount = 6;
    this.isPlaying = true;

    this.container.classList.remove('hidden');
    this.generateSequence();
  }

  private generateSequence(): void {
    this.sequence = [];
    for (let i = 0; i < this.stepCount; i++) {
      this.sequence.push(Math.floor(Math.random() * COLORS.length));
    }
    this.showSequence();
  }

  private showSequence(): void {
    this.isShowing = true;
    this.isPlaying = false;
    this.playerStep = 0;
    this.updateProgress('观察中...');
    this.setInstruction('记住颜色顺序！');

    let step = 0;
    const showNext = () => {
      if (step >= this.sequence.length) {
        this.isShowing = false;
        this.isPlaying = true;
        this.playerStep = 0;
        this.setInstruction('现在重复这个顺序！');
        this.updateProgress(`第 1 / ${this.stepCount} 步`);
        return;
      }
      const idx = this.sequence[step];
      this.highlightButton(idx, true);
      setTimeout(() => {
        this.highlightButton(idx, false);
        step++;
        setTimeout(showNext, 250);
      }, 500);
    };
    showNext();
  }

  private highlightButton(index: number, on: boolean): void {
    const btns = this.container.querySelectorAll('.simon-btn');
    const btn = btns[index] as HTMLElement;
    if (on) {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1.15)';
      btn.style.boxShadow = '0 0 20px rgba(255,255,255,0.6)';
    } else {
      btn.style.opacity = '0.4';
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
    }
  }

  handleInput(index: number): void {
    if (!this.isPlaying || this.isShowing || this.completed) return;
    if (index !== this.sequence[this.playerStep]) {
      this.fail();
      return;
    }
    this.highlightButton(index, true);
    setTimeout(() => this.highlightButton(index, false), 200);
    this.playerStep++;
    if (this.playerStep >= this.sequence.length) {
      this.succeed();
    } else {
      this.updateProgress(`第 ${this.playerStep + 1} / ${this.stepCount} 步`);
    }
  }

  private fail(): void {
    this.isPlaying = false;
    this.setInstruction('顺序错了！重新开始...');
    this.updateProgress('💥 失败');
    setTimeout(() => {
      this.generateSequence();
    }, 1200);
  }

  private succeed(): void {
    this.isPlaying = false;
    this.completed = true;
    this.setInstruction('🎉 神社修复完成！');
    this.updateProgress('✅ 完成');
    this.container.querySelectorAll('.simon-btn').forEach((btn) => {
      (btn as HTMLElement).style.animation = 'simon-complete 0.5s ease';
    });
    setTimeout(() => {
      this.container.classList.add('hidden');
      this.onComplete?.();
    }, 1500);
  }

  private setInstruction(text: string): void {
    const el = this.container.querySelector('#simon-instruction');
    if (el) el.textContent = text;
  }

  private updateProgress(text: string): void {
    const el = this.container.querySelector('#simon-progress');
    if (el) el.textContent = text;
  }

  get isActive(): boolean {
    return !this.container.classList.contains('hidden');
  }

  handleKeyDown(code: string): boolean {
    const keyMap: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 };
    if (code in keyMap) {
      this.handleInput(keyMap[code]);
      return true;
    }
    return false;
  }

  dispose(): void {
    this.container.remove();
  }
}
