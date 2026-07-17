import { ThemeProvider as SCThemeProvider } from 'styled-components';

export interface RestifyTheme {
  /* Core surfaces */
  bg: string;
  fg: string;
  border: string;
  surface: string;
  surface2: string;
  hover: string;
  card: string;
  cardStrong: string;

  /* Inputs */
  inputBg: string;
  inputFg: string;

  /* Accent / buttons */
  accent: string;
  accentFg: string;
  accent2: string;

  /* Semantic colors — VS Code theme tokens, NOT hardcoded hex */
  muted: string;
  error: string;
  warning: string;
  success: string;
  info: string;

  /* Typography */
  fontFamily: string;
  monoFamily: string;

  /* Code editor / gutter */
  lineNumberBg: string;
  lineNumberFg: string;
  lineNumberActiveFg: string;

  /* Layout */
  radius: string;

  /* Scrollbar */
  scrollbarThumb: string;
  scrollbarTrack: string;

  /* Widget / tooltip */
  widgetBg: string;
  widgetBorder: string;

  /* Badge / activity bar */
  badgeBg: string;
  badgeFg: string;

  /* Focus ring */
  focusBorder: string;

  /* Selection */
  selectionBg: string;

  /* Shadows & overlays */
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  overlayBg: string;
  innerHighlight: string;
}

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends RestifyTheme {}
}

/**
 * All values map to `var(--vscode-*)` tokens so the UI automatically
 * adapts to the active VS Code color theme (dark, light, high-contrast,
 * or any installed theme that sets these standard tokens).
 */
export const restifyTheme: RestifyTheme = {
  /* Core surfaces */
  bg: 'var(--vscode-editor-background)',
  fg: 'var(--vscode-editor-foreground)',
  border: 'var(--vscode-panel-border, var(--vscode-editorGroup-border, rgba(128,128,128,0.3)))',
  surface: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
  surface2: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
  hover: 'var(--vscode-list-hoverBackground, rgba(128,128,128,0.1))',
  card: 'var(--vscode-sideBar-background, #252526)',
  cardStrong: 'color-mix(in srgb, var(--vscode-sideBar-background, #252526) 86%, transparent)',

  /* Inputs */
  inputBg: 'var(--vscode-input-background)',
  inputFg: 'var(--vscode-input-foreground)',

  /* Accent / buttons */
  accent: 'var(--vscode-button-background, #0078d4)',
  accentFg: 'var(--vscode-button-foreground, #ffffff)',
  accent2: 'var(--vscode-textLink-foreground, #388bfd)',

  /* Semantic colors — all from VS Code theme tokens */
  muted: 'var(--vscode-descriptionForeground, rgba(128,128,128,0.8))',
  error: 'var(--vscode-errorForeground, #cf222e)',
  warning: 'var(--vscode-warningForeground, #9a6700)',
  success: 'var(--vscode-charts-green, #2da44e)',
  info: 'var(--vscode-textLink-foreground, #3794ff)',

  /* Typography */
  fontFamily: "var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif)",
  monoFamily: "var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', 'Consolas', monospace)",

  /* Code editor / gutter */
  lineNumberBg: 'var(--vscode-editorGutter-background, var(--vscode-editor-background))',
  lineNumberFg: 'var(--vscode-editorLineNumber-foreground, rgba(128,128,128,0.5))',
  lineNumberActiveFg: 'var(--vscode-editorLineNumber-activeForeground, var(--vscode-editor-foreground))',

  /* Layout */
  radius: 'var(--vscode-widgets-border-radius, 8px)',

  /* Scrollbar */
  scrollbarThumb: 'var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.4))',
  scrollbarTrack: 'var(--vscode-scrollbarSlider.background, rgba(128,128,128,0.1))',

  /* Widget / tooltip */
  widgetBg: 'var(--vscode-editorWidget-background, #252526)',
  widgetBorder: 'var(--vscode-editorWidget-border, rgba(128,128,128,0.3))',

  /* Badge / activity bar */
  badgeBg: 'var(--vscode-badge-background, #4d4d4d)',
  badgeFg: 'var(--vscode-badge-foreground, #ffffff)',

  /* Focus ring */
  focusBorder: 'var(--vscode-focusBorder, #007fd4)',

  /* Selection */
  selectionBg: 'var(--vscode-editor-selectionBackground, rgba(0,120,212,0.3))',

  /* Shadows & overlays — adapt to light/dark via VS Code tokens */
  shadowSm: 'var(--vscode-widget-shadow, 0 1px 3px rgba(0,0,0,0.12))',
  shadowMd: 'var(--vscode-widget-shadow, 0 4px 12px rgba(0,0,0,0.15))',
  shadowLg: 'var(--vscode-widget-shadow, 0 8px 24px rgba(0,0,0,0.2))',
  overlayBg: 'var(--vscode-overlay-background, rgba(0,0,0,0.5))',
  innerHighlight: 'color-mix(in srgb, var(--vscode-editor-foreground, #fff) 3%, transparent)',
};

export const ThemeProvider = SCThemeProvider;
export default restifyTheme;
