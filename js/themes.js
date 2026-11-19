// A theme is the whole look of one television: colors, type, corners, and background.
// Old layouts have no theme and resolve to Warm Classic.

export const FONT_PAIRINGS = [
  {
    id: 'elegant',
    label: 'Elegant serif',
    note: 'Fraunces, with a plain sans for the small type',
    heading: '"Fraunces", Palatino, "Palatino Linotype", "Times New Roman", serif',
    body: '"Source Sans 3", "Segoe UI", sans-serif',
    hebrew: '"Noto Serif Hebrew", "Times New Roman", serif',
  },
  {
    id: 'modern',
    label: 'Modern sans',
    note: 'Even letters that stay clear from across the room',
    heading: '"Manrope", "Segoe UI", sans-serif',
    body: '"Manrope", "Segoe UI", sans-serif',
    hebrew: '"Noto Sans Hebrew", "Arial Hebrew", sans-serif',
  },
  {
    id: 'book',
    label: 'Classic book',
    note: 'A library serif and a traditional Hebrew',
    heading: '"Libre Baskerville", Palatino, "Times New Roman", serif',
    body: '"Source Sans 3", "Segoe UI", sans-serif',
    hebrew: '"Frank Ruhl Libre", "Times New Roman", serif',
  },
  {
    id: 'rounded',
    label: 'Rounded',
    note: 'Softer shapes, still large enough to read',
    heading: '"Nunito", "Segoe UI", sans-serif',
    body: '"Nunito", "Segoe UI", sans-serif',
    hebrew: '"Rubik", "Arial Hebrew", sans-serif',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    note: 'A news heading with a simple body',
    heading: '"Source Serif 4", Palatino, "Times New Roman", serif',
    body: '"Outfit", "Segoe UI", sans-serif',
    hebrew: '"Noto Serif Hebrew", "Times New Roman", serif',
  },
  {
    id: 'clean',
    label: 'Clean modern',
    note: 'Inter throughout, with Heebo for Hebrew. Crisp and quiet',
    heading: '"Inter", "Segoe UI", sans-serif',
    body: '"Inter", "Segoe UI", sans-serif',
    hebrew: '"Heebo", "Arial Hebrew", sans-serif',
  },
  {
    id: 'contemporary',
    label: 'Contemporary',
    note: 'Outfit headings over Inter, with Heebo for Hebrew',
    heading: '"Outfit", "Segoe UI", sans-serif',
    body: '"Inter", "Segoe UI", sans-serif',
    hebrew: '"Heebo", "Arial Hebrew", sans-serif',
  },
  {
    id: 'refined',
    label: 'Refined serif',
    note: 'A modern serif heading over Inter',
    heading: '"Fraunces", Palatino, "Times New Roman", serif',
    body: '"Inter", "Segoe UI", sans-serif',
    hebrew: '"Frank Ruhl Libre", "Times New Roman", serif',
  },
];

// How cards are drawn. Solid is the original look. Glass is frosted and see-through.
// Line is a quiet card with a thin edge and no top rule.
export const CARD_STYLES = [
  { id: 'solid', label: 'Solid' },
  { id: 'glass', label: 'Frosted glass' },
  { id: 'line', label: 'Minimal line' },
];

const GROUNDS = ['solid', 'gradient', 'texture'];

export const PRESETS = [
  {
    id: 'midnight',
    label: 'Midnight Glass',
    font: 'clean',
    ground: 'gradient',
    cards: 'glass',
    radius: 20,
    shadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
    bg: '#060a14',
    bg2: '#141d36',
    wash: '#3b5bdb',
    glow: '#b08a3e',
    washAlpha: 0.22,
    glowAlpha: 0.18,
    surface: '#ffffff',
    surface2: '#f1f3f8',
    surfaceInk: '#10141f',
    muted: '#5b6375',
    inverse: '#131a2c',
    inverse2: '#0b1020',
    inverseInk: '#f4f6fb',
    inverseMuted: '#b9c1d3',
    accent: '#d9b56a',
    accent2: '#b8913f',
    accentInk: '#16110a',
    accentMuted: '#4c3c1c',
    rule: '#d9b56a',
    ruleOnDark: '#e8cf97',
    ruleOnAccent: '#5c4316',
    eyebrow: '#9a7428',
    eyebrowOnDark: '#e8cf97',
    frame: 'rgba(255, 255, 255, 0.08)',
  },
  {
    id: 'sapphire',
    label: 'Sapphire',
    font: 'contemporary',
    ground: 'gradient',
    cards: 'glass',
    radius: 18,
    shadow: '0 24px 60px rgba(2, 10, 30, 0.35)',
    bg: '#081830',
    bg2: '#123a6e',
    wash: '#6aa2ff',
    glow: '#020814',
    washAlpha: 0.2,
    glowAlpha: 0.5,
    surface: '#ffffff',
    surface2: '#eef3fb',
    surfaceInk: '#0d1b30',
    muted: '#53627a',
    inverse: '#0e2546',
    inverse2: '#081830',
    inverseInk: '#f3f7fd',
    inverseMuted: '#bccbe2',
    accent: '#e6c578',
    accent2: '#c9a24f',
    accentInk: '#17120a',
    accentMuted: '#4e3f1d',
    rule: '#e6c578',
    ruleOnDark: '#f0dba8',
    ruleOnAccent: '#5c4316',
    eyebrow: '#1f5fbf',
    eyebrowOnDark: '#f0dba8',
    frame: 'rgba(255, 255, 255, 0.1)',
  },
  {
    id: 'graphite',
    label: 'Graphite',
    font: 'clean',
    ground: 'solid',
    cards: 'line',
    radius: 18,
    shadow: '0 18px 40px rgba(0, 0, 0, 0.28)',
    bg: '#111317',
    bg2: '#1a1d23',
    wash: '#ffffff',
    glow: '#000000',
    washAlpha: 0.04,
    glowAlpha: 0.2,
    surface: '#1b1f26',
    surface2: '#181b21',
    surfaceInk: '#f2f3f5',
    muted: '#a3a9b4',
    inverse: '#242a33',
    inverse2: '#1f242c',
    inverseInk: '#f2f3f5',
    inverseMuted: '#a9b0bb',
    accent: '#d4af64',
    accent2: '#b9933f',
    accentInk: '#15110a',
    accentMuted: '#4a3a1a',
    rule: '#d4af64',
    ruleOnDark: '#d4af64',
    ruleOnAccent: '#4a3a1a',
    eyebrow: '#d4af64',
    eyebrowOnDark: '#d4af64',
    frame: 'rgba(255, 255, 255, 0.08)',
  },
  {
    id: 'gallery',
    label: 'Gallery White',
    font: 'contemporary',
    ground: 'solid',
    cards: 'line',
    radius: 18,
    shadow: '0 18px 40px rgba(20, 24, 32, 0.07)',
    bg: '#f3f2ee',
    bg2: '#e9e7e1',
    wash: '#ffffff',
    glow: '#d8d4ca',
    washAlpha: 0.5,
    glowAlpha: 0.3,
    surface: '#ffffff',
    surface2: '#ffffff',
    surfaceInk: '#15181e',
    muted: '#5d636e',
    inverse: '#15181e',
    inverse2: '#15181e',
    inverseInk: '#f6f5f2',
    inverseMuted: '#b8bcc4',
    accent: '#1f3a5f',
    accent2: '#16304f',
    accentInk: '#f4f6f9',
    accentMuted: '#c9d4e3',
    rule: '#1f3a5f',
    ruleOnDark: '#d8c08a',
    ruleOnAccent: '#d8c08a',
    eyebrow: '#8a6a2c',
    eyebrowOnDark: '#d8c08a',
    frame: 'rgba(21, 24, 30, 0.08)',
  },
  {
    id: 'warm-classic',
    label: 'Warm Classic',
    font: 'elegant',
    ground: 'gradient',
    radius: 0,
    shadow: '0 10px 28px rgba(16, 18, 24, 0.16)',
    bg: '#101a2c',
    bg2: '#1a2842',
    wash: '#b8893d',
    glow: '#6d2433',
    washAlpha: 0.18,
    glowAlpha: 0.42,
    surface: '#fffaf3',
    surface2: '#f3eadc',
    surfaceInk: '#241c16',
    muted: '#6e6458',
    inverse: '#243652',
    inverse2: '#0e1828',
    inverseInk: '#fffaf3',
    inverseMuted: '#e7dcc8',
    accent: '#7c2d3e',
    accent2: '#4a1824',
    accentInk: '#f8edd6',
    accentMuted: '#f0ddc4',
    rule: '#b8893d',
    ruleOnDark: '#e4d2a4',
    ruleOnAccent: '#e4d2a4',
    eyebrow: '#8a6230',
    eyebrowOnDark: '#e4d2a4',
    frame: 'rgba(228, 210, 164, 0.45)',
    band: 'linear-gradient(90deg, #3f1520 0%, #7a2a3a 48%, #3f1520 100%)',
  },
  {
    id: 'navy-gold',
    label: 'Modern Navy & Gold',
    font: 'modern',
    ground: 'gradient',
    radius: 14,
    shadow: '0 14px 34px rgba(4, 12, 24, 0.28)',
    bg: '#071525',
    bg2: '#123056',
    wash: '#e4c98a',
    glow: '#1d4e89',
    washAlpha: 0.2,
    glowAlpha: 0.4,
    surface: '#f7f5f0',
    surface2: '#ece7dc',
    surfaceInk: '#122033',
    muted: '#5c6a78',
    inverse: '#0c2340',
    inverse2: '#08182e',
    inverseInk: '#f6f3ea',
    inverseMuted: '#d5dbe3',
    accent: '#d4b36a',
    accent2: '#b8924a',
    accentInk: '#1b1408',
    accentMuted: '#4a3b22',
    rule: '#d4b36a',
    ruleOnDark: '#f0e2bc',
    ruleOnAccent: '#5c4316',
    eyebrow: '#8d6a2f',
    eyebrowOnDark: '#f0e2bc',
    frame: 'rgba(212, 179, 106, 0.55)',
  },
  {
    id: 'clean-white',
    label: 'Clean White',
    font: 'book',
    ground: 'solid',
    radius: 2,
    shadow: '0 10px 28px rgba(28, 28, 28, 0.08)',
    bg: '#f4f1eb',
    bg2: '#e7e2d8',
    wash: '#ffffff',
    glow: '#d9d3c7',
    washAlpha: 0.5,
    glowAlpha: 0.35,
    surface: '#ffffff',
    surface2: '#f7f5f2',
    surfaceInk: '#1c1c1c',
    muted: '#5e5a55',
    inverse: '#1c2430',
    inverse2: '#121820',
    inverseInk: '#f7f5f2',
    inverseMuted: '#c9c3b8',
    accent: '#1f3d36',
    accent2: '#16302a',
    accentInk: '#f4f7f4',
    accentMuted: '#d5e0da',
    rule: '#1f3d36',
    ruleOnDark: '#d7c7a1',
    ruleOnAccent: '#d7c7a1',
    eyebrow: '#1f3d36',
    eyebrowOnDark: '#d7c7a1',
    frame: 'rgba(31, 61, 54, 0.28)',
  },
  {
    id: 'night',
    label: 'Night',
    font: 'modern',
    ground: 'solid',
    radius: 8,
    shadow: '0 16px 36px rgba(0, 0, 0, 0.45)',
    bg: '#05070c',
    bg2: '#10151f',
    wash: '#f0d48a',
    glow: '#000000',
    washAlpha: 0.08,
    glowAlpha: 0.2,
    surface: '#161d2b',
    surface2: '#101722',
    surfaceInk: '#f6f1e6',
    muted: '#c3bbae',
    inverse: '#f4efe4',
    inverse2: '#e7e0d2',
    inverseInk: '#14120e',
    inverseMuted: '#5c564c',
    accent: '#f0d48a',
    accent2: '#e2c06a',
    accentInk: '#1a1408',
    accentMuted: '#5a4520',
    rule: '#f0d48a',
    ruleOnDark: '#f0d48a',
    ruleOnAccent: '#6a5018',
    eyebrow: '#f0d48a',
    eyebrowOnDark: '#6a5018',
    frame: 'rgba(240, 212, 138, 0.7)',
  },
  {
    id: 'soft-sage',
    label: 'Soft Sage',
    font: 'rounded',
    ground: 'gradient',
    radius: 16,
    shadow: '0 12px 28px rgba(30, 50, 40, 0.12)',
    bg: '#dfe8df',
    bg2: '#c9d7cc',
    wash: '#f7f3ea',
    glow: '#3f6b52',
    washAlpha: 0.55,
    glowAlpha: 0.16,
    surface: '#fbfaf6',
    surface2: '#f0eee6',
    surfaceInk: '#1c2b24',
    muted: '#5c6b62',
    inverse: '#24382e',
    inverse2: '#1a2b22',
    inverseInk: '#f4f7f2',
    inverseMuted: '#d5e0d8',
    accent: '#3d6b52',
    accent2: '#2c5340',
    accentInk: '#f5f8f4',
    accentMuted: '#d7e6dc',
    rule: '#b08948',
    ruleOnDark: '#e6d3a4',
    ruleOnAccent: '#e6d3a4',
    eyebrow: '#8a6230',
    eyebrowOnDark: '#e6d3a4',
    frame: 'rgba(61, 107, 82, 0.35)',
  },
  {
    id: 'shabbos-blue',
    label: 'Shabbos Blue',
    font: 'book',
    ground: 'gradient',
    radius: 10,
    shadow: '0 14px 32px rgba(6, 20, 40, 0.28)',
    bg: '#0c2744',
    bg2: '#163e68',
    wash: '#d5e4f7',
    glow: '#07182c',
    washAlpha: 0.18,
    glowAlpha: 0.45,
    surface: '#f4f7fb',
    surface2: '#e4ecf5',
    surfaceInk: '#12263d',
    muted: '#5a6d82',
    inverse: '#12365c',
    inverse2: '#0c2844',
    inverseInk: '#f5f8fc',
    inverseMuted: '#d3deea',
    accent: '#d7e6f6',
    accent2: '#c3d6ee',
    accentInk: '#10283f',
    accentMuted: '#3d5570',
    rule: '#d7e6f6',
    ruleOnDark: '#d7e6f6',
    ruleOnAccent: '#1d4268',
    eyebrow: '#1d4e89',
    eyebrowOnDark: '#d7e6f6',
    frame: 'rgba(215, 230, 246, 0.55)',
  },
  {
    id: 'jerusalem-stone',
    label: 'Jerusalem Stone',
    font: 'book',
    ground: 'texture',
    radius: 4,
    shadow: '0 12px 26px rgba(80, 58, 36, 0.14)',
    bg: '#e4d3bb',
    bg2: '#d3bea2',
    wash: '#f7f1e6',
    glow: '#8c4a32',
    washAlpha: 0.45,
    glowAlpha: 0.12,
    surface: '#f8f1e4',
    surface2: '#efe4d2',
    surfaceInk: '#3a2c22',
    muted: '#7a6856',
    inverse: '#6a5040',
    inverse2: '#543e32',
    inverseInk: '#fbf6ee',
    inverseMuted: '#f0e2d4',
    accent: '#8d4530',
    accent2: '#6e3424',
    accentInk: '#fbf6ee',
    accentMuted: '#f3ddd4',
    rule: '#a68456',
    ruleOnDark: '#f0e2c4',
    ruleOnAccent: '#f0e2c4',
    eyebrow: '#8d4530',
    eyebrowOnDark: '#f0e2c4',
    frame: 'rgba(141, 69, 48, 0.35)',
  },
  {
    id: 'black-gold',
    label: 'Elegant Black & Gold',
    font: 'elegant',
    ground: 'solid',
    radius: 0,
    shadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
    bg: '#0a0a0a',
    bg2: '#161616',
    wash: '#c6a15b',
    glow: '#000000',
    washAlpha: 0.14,
    glowAlpha: 0.35,
    surface: '#141414',
    surface2: '#0e0e0e',
    surfaceInk: '#f6f1e6',
    muted: '#cbbfa8',
    inverse: '#f3ead7',
    inverse2: '#e6dcc6',
    inverseInk: '#16130e',
    inverseMuted: '#5e5648',
    accent: '#c6a15b',
    accent2: '#a8863e',
    accentInk: '#1a1408',
    accentMuted: '#5c4a28',
    rule: '#c6a15b',
    ruleOnDark: '#e7d7a8',
    ruleOnAccent: '#4a3916',
    eyebrow: '#e7d7a8',
    eyebrowOnDark: '#6a5424',
    frame: 'rgba(198, 161, 91, 0.75)',
  },
];

function hexToRgb(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num) || full.length !== 6) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex({ r, g, b }) {
  const part = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function isHex(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a, b) {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const ch = (k) => a[k] + (b[k] - a[k]) * t;
  return rgbToHex({ r: ch('r'), g: ch('g'), b: ch('b') });
}

export function inkFor(hex) {
  return luminance(hex) > 0.42 ? '#1a1612' : '#f7f3ea';
}

function rgba(hex, alpha) {
  const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function presetById(id) {
  return PRESETS.find((item) => item.id === id) || PRESETS.find((item) => item.id === 'warm-classic');
}

export function fontById(id) {
  return FONT_PAIRINGS.find((item) => item.id === id) || FONT_PAIRINGS[0];
}

export function normalizeTheme(raw) {
  // Old layouts have no preset and stay on Warm Classic, which used to be first.
  const preset = raw?.preset ? presetById(raw.preset) : presetById('warm-classic');
  const font = FONT_PAIRINGS.some((item) => item.id === raw?.font) ? raw.font : preset.font;
  const ground = GROUNDS.includes(raw?.ground) ? raw.ground : preset.ground;
  const cards = CARD_STYLES.some((item) => item.id === raw?.cards) ? raw.cards : (preset.cards || 'solid');
  return {
    preset: preset.id,
    font,
    ground,
    cards,
    accent: isHex(raw?.accent) ? raw.accent : null,
    background: isHex(raw?.background) ? raw.background : null,
  };
}

function stageBackground(ground, bg, bg2, wash, glow) {
  if (ground === 'solid') return bg;
  const veil = `radial-gradient(85% 60% at 8% 0%, ${wash}, transparent 58%)`;
  const depth = `radial-gradient(70% 65% at 100% 100%, ${glow}, transparent 54%)`;
  const base = `linear-gradient(165deg, ${bg2}, ${bg} 62%)`;
  if (ground === 'texture') {
    const grain = 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(60, 40, 20, 0.045) 3px, rgba(60, 40, 20, 0.045) 4px)';
    const specks = 'radial-gradient(circle at 18% 22%, rgba(255,255,255,0.18) 0 0.6px, transparent 1.1px)';
    return `${specks}, ${grain}, ${veil}, ${depth}, ${base}`;
  }
  return `${veil}, ${depth}, ${base}`;
}

export function resolveTheme(raw) {
  const theme = normalizeTheme(raw);
  const preset = presetById(theme.preset);
  const font = fontById(theme.font);
  const bg = theme.background || preset.bg;
  const bg2 = theme.background ? mix(bg, luminance(bg) > 0.5 ? '#000000' : '#ffffff', 0.14) : preset.bg2;
  const accent = theme.accent || preset.accent;
  const accent2 = theme.accent ? mix(accent, luminance(accent) > 0.5 ? '#000000' : '#ffffff', 0.22) : preset.accent2;
  const accentInk = theme.accent ? inkFor(accent) : preset.accentInk;
  const accentMuted = theme.accent ? mix(accentInk, accent, 0.35) : preset.accentMuted;
  const ruleOnAccent = theme.accent ? (luminance(accent) > 0.45 ? '#3a2a14' : '#f3e6c8') : preset.ruleOnAccent;
  const stage = luminance(bg) > 0.45 ? 'light' : 'dark';
  const stageInk = inkFor(bg);
  const wash = rgba(theme.background ? mix(bg, '#ffffff', 0.35) : preset.wash, preset.washAlpha);
  const glow = rgba(theme.background ? mix(bg, '#000000', 0.35) : preset.glow, preset.glowAlpha);
  const band = theme.accent
    ? `linear-gradient(90deg, ${accent2} 0%, ${accent} 48%, ${accent2} 100%)`
    : (preset.band || `linear-gradient(90deg, ${accent2} 0%, ${accent} 48%, ${accent2} 100%)`);
  const vars = {
    '--stage-bg': stageBackground(theme.ground, bg, bg2, wash, glow),
    '--stage-ink': stageInk,
    '--bg': bg,
    '--surface': preset.surface,
    '--surface-2': preset.surface2,
    '--surface-ink': preset.surfaceInk,
    '--muted': preset.muted,
    '--inverse': preset.inverse,
    '--inverse-2': preset.inverse2,
    '--inverse-ink': preset.inverseInk,
    '--inverse-muted': preset.inverseMuted,
    '--accent': accent,
    '--accent-2': accent2,
    '--accent-ink': accentInk,
    '--accent-muted': accentMuted,
    '--rule': preset.rule,
    '--rule-on-dark': preset.ruleOnDark,
    '--rule-on-accent': ruleOnAccent,
    '--eyebrow': preset.eyebrow,
    '--eyebrow-on-dark': preset.eyebrowOnDark,
    '--clear-eyebrow': stage === 'dark' ? preset.eyebrowOnDark : preset.eyebrow,
    '--line': rgba(preset.surfaceInk, 0.16),
    '--line-strong': rgba(preset.inverseInk, 0.22),
    '--frame': preset.frame,
    '--radius': `${preset.radius}px`,
    '--card-shadow': preset.shadow,
    '--band-bg': band,
    '--serif': font.heading,
    '--sans': font.body,
    '--hebrew': font.hebrew,
    '--scrim': `linear-gradient(180deg, ${rgba(bg, 0.15)} 0%, ${rgba(bg, 0.82)} 78%)`,
    '--glass-bg': stage === 'dark' ? 'rgba(255, 255, 255, 0.075)' : 'rgba(255, 255, 255, 0.62)',
    '--glass-bg-2': stage === 'dark' ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.82)',
    '--glass-ink': stageInk,
    '--glass-muted': stage === 'dark' ? 'rgba(244, 246, 251, 0.68)' : 'rgba(21, 24, 30, 0.62)',
    '--glass-line': stage === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(21, 24, 30, 0.08)',
    '--glass-eyebrow': stage === 'dark' ? preset.eyebrowOnDark : preset.eyebrow,
  };
  return { ...theme, stage, label: preset.label, vars };
}

export function applyTheme(element, raw) {
  if (!element) return null;
  const resolved = resolveTheme(raw);
  element.dataset.stage = resolved.stage;
  element.dataset.ground = resolved.ground;
  element.dataset.cards = resolved.cards;
  element.dataset.preset = resolved.preset;
  element.dataset.logo = luminance(resolved.vars['--bg']) < 0.008 ? 'plate' : 'bare';
  Object.entries(resolved.vars).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
  element.style.background = resolved.vars['--stage-bg'];
  element.style.color = resolved.vars['--stage-ink'];
  return resolved;
}
