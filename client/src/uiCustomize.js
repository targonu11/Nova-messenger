import { getAppSettings } from './appSettings';
import { applyMotionPreferences } from './motion';

const ACCENTS = {
  nova: {
    dark: {
      accent: '#7812e4',
      hover: '#9638f0',
      soft: 'rgba(120, 18, 228, 0.18)',
      warm: '#d6872d',
      mid: '#a74c89',
    },
    light: {
      accent: '#7812e4',
      hover: '#6510c4',
      soft: 'rgba(120, 18, 228, 0.12)',
      warm: '#d6872d',
      mid: '#a74c89',
    },
  },
  purple: {
    dark: { accent: '#a78bfa', hover: '#c4b5fd', soft: 'rgba(167, 139, 250, 0.25)' },
    light: { accent: '#7c3aed', hover: '#8b5cf6', soft: 'rgba(124, 58, 237, 0.15)' },
  },
  green: {
    dark: { accent: '#34d399', hover: '#6ee7b7', soft: 'rgba(52, 211, 153, 0.2)' },
    light: { accent: '#059669', hover: '#10b981', soft: 'rgba(5, 150, 105, 0.15)' },
  },
  rose: {
    dark: { accent: '#fb7185', hover: '#fda4af', soft: 'rgba(251, 113, 133, 0.2)' },
    light: { accent: '#e11d48', hover: '#f43f5e', soft: 'rgba(225, 29, 72, 0.12)' },
  },
  orange: {
    dark: { accent: '#fb923c', hover: '#fdba74', soft: 'rgba(251, 146, 60, 0.2)' },
    light: { accent: '#ea580c', hover: '#f97316', soft: 'rgba(234, 88, 12, 0.15)' },
  },
  teal: {
    dark: { accent: '#2dd4bf', hover: '#5eead4', soft: 'rgba(45, 212, 191, 0.2)' },
    light: { accent: '#0d9488', hover: '#14b8a6', soft: 'rgba(13, 148, 136, 0.15)' },
  },
};

const SIDEBAR_WIDTH = {
  narrow: '252px',
  normal: '300px',
  wide: '348px',
};

function applyAccentVars(root, a) {
  root.style.setProperty('--accent', a.accent);
  root.style.setProperty('--accent-hover', a.hover);
  root.style.setProperty('--accent-soft', a.soft);

  if (a.warm && a.mid) {
    root.style.setProperty('--accent-warm', a.warm);
    root.style.setProperty('--accent-mid', a.mid);
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${a.accent} 0%, ${a.mid} 52%, ${a.warm} 100%)`);
    root.style.setProperty('--accent-gradient-v', `linear-gradient(180deg, ${a.accent} 0%, ${a.mid} 55%, ${a.warm} 100%)`);
    root.style.setProperty('--accent-gradient-hover', `linear-gradient(135deg, ${a.hover} 0%, ${a.mid} 52%, ${a.warm} 100%)`);
    root.style.setProperty('--accent-glow', 'rgba(120, 18, 228, 0.32)');
    root.style.setProperty('--accent-glow-warm', 'rgba(214, 135, 45, 0.24)');
  } else {
    root.style.setProperty('--accent-warm', a.hover);
    root.style.setProperty('--accent-mid', a.accent);
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${a.accent} 0%, ${a.hover} 100%)`);
    root.style.setProperty('--accent-gradient-v', `linear-gradient(180deg, ${a.accent} 0%, ${a.hover} 100%)`);
    root.style.setProperty('--accent-gradient-hover', `linear-gradient(180deg, ${a.hover} 0%, ${a.accent} 100%)`);
    root.style.setProperty('--accent-glow', a.soft);
    root.style.removeProperty('--accent-glow-warm');
  }
}

/** Применить шрифт, акцент, плотность, скругления и прочий GUI из appSettings к :root */
export function applyUiCustomization() {
  const s = getAppSettings();
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

  const scale = { s: '14px', m: '16px', l: '18px', xl: '20px' };
  const fs = scale[s.uiFontScale] || '16px';
  root.style.setProperty('--app-font-size', fs);

  const raw = s.uiAccentPreset === 'blue' ? 'nova' : s.uiAccentPreset;
  const preset = ACCENTS[raw] ? raw : 'nova';
  applyAccentVars(root, ACCENTS[preset][theme]);

  if (s.uiChatDensity === 'compact') {
    root.setAttribute('data-density', 'compact');
  } else {
    root.removeAttribute('data-density');
  }

  if (s.uiRadius === 'soft') {
    root.style.setProperty('--radius', '18px');
    root.style.setProperty('--radius-sm', '12px');
  } else {
    root.style.removeProperty('--radius');
    root.style.removeProperty('--radius-sm');
  }

  const sw = s.uiSidebarWidth === 'narrow' || s.uiSidebarWidth === 'wide' ? s.uiSidebarWidth : 'normal';
  root.style.setProperty('--sidebar-width', SIDEBAR_WIDTH[sw]);

  const gapMap = { tight: '2px', normal: '5px', relaxed: '14px' };
  const gk = s.uiMessageGap === 'tight' || s.uiMessageGap === 'relaxed' ? s.uiMessageGap : 'normal';
  root.style.setProperty('--chat-message-gap', gapMap[gk]);

  if (s.uiShowMessageAvatars === false) {
    root.setAttribute('data-hide-message-avatars', 'true');
  } else {
    root.removeAttribute('data-hide-message-avatars');
  }

  if (s.uiLowSaturation) {
    root.style.filter = 'saturate(0.78)';
  } else {
    root.style.filter = '';
  }

  if (typeof window !== 'undefined') {
    applyMotionPreferences();
    window.dispatchEvent(new Event('nova-app-settings'));
  }
}
