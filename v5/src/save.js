// Persistent meta progression — the between-runs layer that turns a losing
// run into progress instead of a dead end.

// Version 5 keeps its own save. The first time it runs it starts from the
// Version 4 save, so progress carries over; after that the two never touch.
const KEY = 'ashfall.v5.save';
const SEED_KEY = 'ashfall.v4.save';

const DEFAULTS = {
  darkness: 0,
  upgrades: { vitality: 0, might: 0, alacrity: 0, fortune: 0 },
  best: { depth: 0, kills: 0, gold: 0 },
  runs: 0,
  wins: 0,
  muted: false,
  musicOn: true,
  musicVolume: 0.7,
  biome: 'ember',
  tutorialSeen: false,   // the tutorial is offered once, before the first run
};

export const UPGRADES = [
  {
    id: 'vitality', name: 'Vitality', max: 5,
    desc: (lv) => `+${(lv + 1) * 10} max health`,
    cost: (lv) => 30 + lv * 25,
  },
  {
    id: 'might', name: 'Might', max: 5,
    desc: (lv) => `+${(lv + 1) * 6}% damage`,
    cost: (lv) => 35 + lv * 30,
  },
  {
    id: 'alacrity', name: 'Alacrity', max: 2,
    desc: (lv) => `+${lv + 1} dash charge${lv ? 's' : ''}`,
    cost: (lv) => 120 + lv * 150,
  },
  {
    id: 'fortune', name: 'Fortune', max: 3,
    desc: (lv) => `+${(lv + 1) * 20}% gold gained`,
    cost: (lv) => 60 + lv * 60,
  },
];

export let save = structuredClone(DEFAULTS);

export function loadSave() {
  try {
    const raw = (localStorage.getItem(KEY) ?? localStorage.getItem(SEED_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      save = {
        ...structuredClone(DEFAULTS),
        ...parsed,
        upgrades: { ...DEFAULTS.upgrades, ...(parsed.upgrades || {}) },
        best: { ...DEFAULTS.best, ...(parsed.best || {}) },
      };
    }
  } catch {
    // Corrupt or unavailable storage (private mode) — fall back to defaults.
    save = structuredClone(DEFAULTS);
  }
  return save;
}

export function writeSave() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Nothing we can do; the run still plays fine without persistence.
  }
}

export function upgradeCost(u) {
  return u.cost(save.upgrades[u.id] || 0);
}

export function canAfford(u) {
  const lv = save.upgrades[u.id] || 0;
  return lv < u.max && save.darkness >= upgradeCost(u);
}

export function buyUpgrade(u) {
  if (!canAfford(u)) return false;
  save.darkness -= upgradeCost(u);
  save.upgrades[u.id] = (save.upgrades[u.id] || 0) + 1;
  writeSave();
  return true;
}

export function metaBonuses() {
  return { ...save.upgrades };
}

export function goldMultiplier() {
  return 1 + (save.upgrades.fortune || 0) * 0.2;
}

export function bankRun({ gold, depth, kills, won }) {
  save.darkness += Math.round(gold * goldMultiplier());
  save.runs += 1;
  if (won) save.wins += 1;
  save.best.depth = Math.max(save.best.depth, depth);
  save.best.kills = Math.max(save.best.kills, kills);
  save.best.gold = Math.max(save.best.gold, gold);
  writeSave();
}

export function resetSave() {
  save = structuredClone(DEFAULTS);
  writeSave();
}
