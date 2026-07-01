import { DeerRarity } from '../entities/Deer';

export interface DeerEntry {
  index: number;
  name: string;
  personality: string;
  rarity: DeerRarity;
  specialVariant: string;
  isMale: boolean;
  hasAntlers: boolean;
  fed: boolean;
}

const RARITY_STARS: Record<DeerRarity, string> = {
  [DeerRarity.Common]: '★',
  [DeerRarity.Uncommon]: '★★',
  [DeerRarity.Rare]: '★★★',
  [DeerRarity.Legendary]: '★★★★',
};

const RARITY_LABEL: Record<DeerRarity, string> = {
  [DeerRarity.Common]: '普通',
  [DeerRarity.Uncommon]: '稀有',
  [DeerRarity.Rare]: '珍稀',
  [DeerRarity.Legendary]: '传说',
};

const RARITY_COLORS: Record<DeerRarity, string> = {
  [DeerRarity.Common]: '#a0a0a0',
  [DeerRarity.Uncommon]: '#4fc3f7',
  [DeerRarity.Rare]: '#ffd54f',
  [DeerRarity.Legendary]: '#ff6f00',
};

export class Journal {
  private readonly collected = new Set<number>();
  private readonly entries: DeerEntry[];
  private readonly overlay: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly totalEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private isOpen = false;

  constructor(entries: DeerEntry[]) {
    this.entries = entries;

    this.overlay = this.getElement('#journal-overlay');
    this.grid = this.getElement('#journal-grid');
    this.countEl = this.getElement('#journal-count');
    this.totalEl = this.getElement('#journal-total');
    this.hintEl = this.getElement('#journal-hint');

    // Close button
    const closeBtn = document.getElementById('journal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Clicking backdrop closes
    const backdrop = this.overlay.querySelector('.journal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => this.close());
    }

    this.totalEl.textContent = String(this.entries.length);
    this.render();
  }

  markCollected(index: number): void {
    if (!this.collected.has(index)) {
      this.collected.add(index);
      this.countEl.textContent = String(this.collected.size);
    }
    // Update the card in-place
    const card = this.grid.querySelector(`[data-deer-index="${index}"]`);
    if (card) {
      card.classList.add('collected');
      const icon = card.querySelector('.deer-icon') as HTMLElement;
      if (icon) icon.style.filter = 'none';
      const badge = card.querySelector('.deer-badge') as HTMLElement;
      if (badge) badge.textContent = '✓ 已收集';
    }
  }

  isCollected(index: number): boolean {
    return this.collected.has(index);
  }

  getCollectedCount(): number {
    return this.collected.size;
  }

  getTotalCount(): number {
    return this.entries.length;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.render(); // Re-render to refresh collected state
    this.overlay.classList.add('show');
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('show');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  isShowing(): boolean {
    return this.isOpen;
  }

  private render(): void {
    this.grid.innerHTML = '';
    for (const entry of this.entries) {
      const card = document.createElement('div');
      card.className = 'journal-card';
      if (this.collected.has(entry.index)) {
        card.classList.add('collected');
      }
      card.dataset.deerIndex = String(entry.index);

      const collected = this.collected.has(entry.index);

      // Icon area
      const icon = document.createElement('div');
      icon.className = 'deer-icon';
      if (entry.specialVariant === 'golden') {
        icon.textContent = '🦌';
        icon.style.color = '#ffd700';
      } else if (entry.specialVariant === 'butterfly') {
        icon.textContent = '🦋';
        icon.style.color = '#ff69b4';
      } else if (entry.hasAntlers) {
        icon.textContent = '🦌';
      } else {
        icon.textContent = '🦌';
      }
      if (!collected) {
        icon.style.filter = 'grayscale(1) opacity(0.3)';
      }

      // Name
      const name = document.createElement('div');
      name.className = 'deer-name';
      name.textContent = collected ? entry.name : '???';

      // Rarity stars
      const stars = document.createElement('div');
      stars.className = 'deer-rarity';
      const starCount = RARITY_STARS[entry.rarity];
      stars.textContent = starCount;
      stars.style.color = RARITY_COLORS[entry.rarity];

      // Personality / type
      const type = document.createElement('div');
      type.className = 'deer-personality';
      if (collected) {
        type.textContent = entry.personality;
        if (entry.isMale) type.textContent += ' ♂';
        else type.textContent += ' ♀';
      } else {
        type.textContent = '???';
      }

      // Special variant badge
      const specialEl = document.createElement('div');
      specialEl.className = 'deer-special';
      if (collected && entry.specialVariant !== 'none') {
        const labels: Record<string, string> = { golden: '✨ 金色', butterfly: '🦋 蝴蝶' };
        specialEl.textContent = labels[entry.specialVariant] ?? '';
      } else {
        specialEl.textContent = '';
      }

      // Rarity label
      const rarityLabel = document.createElement('div');
      rarityLabel.className = 'deer-rarity-label';
      if (collected) {
        rarityLabel.textContent = RARITY_LABEL[entry.rarity];
        rarityLabel.style.color = RARITY_COLORS[entry.rarity];
      }

      // Badge (collected / uncollected)
      const badge = document.createElement('div');
      badge.className = 'deer-badge';
      badge.textContent = collected ? '✓ 已收集' : '未发现';

      card.appendChild(icon);
      card.appendChild(name);
      card.appendChild(stars);
      card.appendChild(type);
      if (entry.specialVariant !== 'none' && collected) card.appendChild(specialEl);
      if (collected) card.appendChild(rarityLabel);
      card.appendChild(badge);
      this.grid.appendChild(card);
    }
  }

  private getElement(selector: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Missing journal element: ${selector}`);
    return el;
  }
}
