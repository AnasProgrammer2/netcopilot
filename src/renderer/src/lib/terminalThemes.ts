// Terminal color themes compatible with xterm.js ITheme

export interface TerminalTheme {
  id: string
  name: string
  dark: boolean
  preview: {
    bg: string
    fg: string
    green: string
    blue: string
    red: string
    yellow: string
  }
  colors: {
    background: string
    foreground: string
    cursor: string
    cursorAccent: string
    selectionBackground: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
}

export const TERMINAL_THEMES: TerminalTheme[] = [
  {
    id: 'netcopilot',
    name: 'Netcopilot',
    dark: true,
    preview: { bg: '#0B0718', fg: '#e8eaf0', green: '#69ff94', blue: '#60a5fa', red: '#ff6b6b', yellow: '#ffd93d' },
    colors: {
      background:          '#0B0718',
      foreground:          '#e8eaf0',
      cursor:              '#e8eaf0',
      cursorAccent:        '#0B0718',
      selectionBackground: '#8b5cf640',
      black:         '#1e2030', red:           '#ff6b6b',
      green:         '#69ff94', yellow:        '#ffd93d',
      blue:          '#60a5fa', magenta:       '#c792ea',
      cyan:          '#6fcfe3', white:         '#e8eaf0',
      brightBlack:   '#4a5568', brightRed:     '#ff8585',
      brightGreen:   '#80ffaa', brightYellow:  '#ffe066',
      brightBlue:    '#7db5ff', brightMagenta: '#d4a5f5',
      brightCyan:    '#89dceb', brightWhite:   '#ffffff',
    },
  },
  {
    id: 'termius-dark',
    name: 'Termius Dark',
    dark: true,
    preview: { bg: '#1c1d26', fg: '#ffffff', green: '#6be7a2', blue: '#7aa2f7', red: '#f7768e', yellow: '#e0af68' },
    colors: {
      background:          '#1c1d26',
      foreground:          '#ffffff',
      cursor:              '#ffffff',
      cursorAccent:        '#1c1d26',
      selectionBackground: '#ffffff30',
      black:         '#15161e', red:           '#f7768e',
      green:         '#9ece6a', yellow:        '#e0af68',
      blue:          '#7aa2f7', magenta:       '#bb9af7',
      cyan:          '#7dcfff', white:         '#a9b1d6',
      brightBlack:   '#414868', brightRed:     '#f7768e',
      brightGreen:   '#9ece6a', brightYellow:  '#e0af68',
      brightBlue:    '#7aa2f7', brightMagenta: '#bb9af7',
      brightCyan:    '#7dcfff', brightWhite:   '#c0caf5',
    },
  },
  {
    id: 'termius-light',
    name: 'Termius Light',
    dark: false,
    preview: { bg: '#f5f5f5', fg: '#343b58', green: '#485e30', blue: '#34548a', red: '#8c4351', yellow: '#8f5e15' },
    colors: {
      background:          '#f5f5f5',
      foreground:          '#343b58',
      cursor:              '#343b58',
      cursorAccent:        '#f5f5f5',
      selectionBackground: '#343b5820',
      black:         '#d5d6db', red:           '#8c4351',
      green:         '#485e30', yellow:        '#8f5e15',
      blue:          '#34548a', magenta:       '#5a4a78',
      cyan:          '#0f4b6e', white:         '#343b58',
      brightBlack:   '#9699a3', brightRed:     '#8c4351',
      brightGreen:   '#485e30', brightYellow:  '#8f5e15',
      brightBlue:    '#34548a', brightMagenta: '#5a4a78',
      brightCyan:    '#0f4b6e', brightWhite:   '#343b58',
    },
  },
  {
    id: 'flexoki-dark',
    name: 'Flexoki Dark',
    dark: true,
    preview: { bg: '#100f0f', fg: '#cecdc3', green: '#879a39', blue: '#4385be', red: '#d14d41', yellow: '#d0a215' },
    colors: {
      background:          '#100f0f',
      foreground:          '#cecdc3',
      cursor:              '#cecdc3',
      cursorAccent:        '#100f0f',
      selectionBackground: '#cecdc320',
      black:         '#282726', red:           '#d14d41',
      green:         '#879a39', yellow:        '#d0a215',
      blue:          '#4385be', magenta:       '#ce5d97',
      cyan:          '#3aa99f', white:         '#b7b5ac',
      brightBlack:   '#575653', brightRed:     '#d14d41',
      brightGreen:   '#879a39', brightYellow:  '#d0a215',
      brightBlue:    '#4385be', brightMagenta: '#ce5d97',
      brightCyan:    '#3aa99f', brightWhite:   '#cecdc3',
    },
  },
  {
    id: 'flexoki-light',
    name: 'Flexoki Light',
    dark: false,
    preview: { bg: '#fffcf0', fg: '#100f0f', green: '#66800b', blue: '#205ea6', red: '#c13030', yellow: '#ad8301' },
    colors: {
      background:          '#fffcf0',
      foreground:          '#100f0f',
      cursor:              '#100f0f',
      cursorAccent:        '#fffcf0',
      selectionBackground: '#100f0f18',
      black:         '#f2f0e5', red:           '#c13030',
      green:         '#66800b', yellow:        '#ad8301',
      blue:          '#205ea6', magenta:       '#a02f6f',
      cyan:          '#24837b', white:         '#6f6e69',
      brightBlack:   '#b7b5ac', brightRed:     '#c13030',
      brightGreen:   '#66800b', brightYellow:  '#ad8301',
      brightBlue:    '#205ea6', brightMagenta: '#a02f6f',
      brightCyan:    '#24837b', brightWhite:   '#100f0f',
    },
  },
  {
    id: 'kanagawa-wave',
    name: 'Kanagawa Wave',
    dark: true,
    preview: { bg: '#1f1f28', fg: '#dcd7ba', green: '#76946a', blue: '#7e9cd8', red: '#c34043', yellow: '#c0a36e' },
    colors: {
      background:          '#1f1f28',
      foreground:          '#dcd7ba',
      cursor:              '#c8c093',
      cursorAccent:        '#1f1f28',
      selectionBackground: '#2d4f6730',
      black:         '#090618', red:           '#c34043',
      green:         '#76946a', yellow:        '#c0a36e',
      blue:          '#7e9cd8', magenta:       '#957fb8',
      cyan:          '#6a9589', white:         '#c8c093',
      brightBlack:   '#727169', brightRed:     '#e82424',
      brightGreen:   '#98bb6c', brightYellow:  '#e6c384',
      brightBlue:    '#7fb4ca', brightMagenta: '#938aa9',
      brightCyan:    '#7aa89f', brightWhite:   '#dcd7ba',
    },
  },
  {
    id: 'kanagawa-dragon',
    name: 'Kanagawa Dragon',
    dark: true,
    preview: { bg: '#0d0c0c', fg: '#c5c9c5', green: '#8a9a7b', blue: '#8ba4b0', red: '#c4746f', yellow: '#c4b28a' },
    colors: {
      background:          '#0d0c0c',
      foreground:          '#c5c9c5',
      cursor:              '#c5c9c5',
      cursorAccent:        '#0d0c0c',
      selectionBackground: '#c5c9c520',
      black:         '#1d1c19', red:           '#c4746f',
      green:         '#8a9a7b', yellow:        '#c4b28a',
      blue:          '#8ba4b0', magenta:       '#a292a3',
      cyan:          '#8ea4a2', white:         '#c8cd8b',
      brightBlack:   '#a6a69c', brightRed:     '#e46876',
      brightGreen:   '#87a987', brightYellow:  '#e6c384',
      brightBlue:    '#7fb4ca', brightMagenta: '#938aa9',
      brightCyan:    '#7aa89f', brightWhite:   '#c5c9c5',
    },
  },
  {
    id: 'kanagawa-lotus',
    name: 'Kanagawa Lotus',
    dark: false,
    preview: { bg: '#f2ecbc', fg: '#545464', green: '#6f894e', blue: '#4d699b', red: '#c84053', yellow: '#77713f' },
    colors: {
      background:          '#f2ecbc',
      foreground:          '#545464',
      cursor:              '#545464',
      cursorAccent:        '#f2ecbc',
      selectionBackground: '#54546418',
      black:         '#1f1f28', red:           '#c84053',
      green:         '#6f894e', yellow:        '#77713f',
      blue:          '#4d699b', magenta:       '#b35b79',
      cyan:          '#597b75', white:         '#545464',
      brightBlack:   '#8a8980', brightRed:     '#d7474b',
      brightGreen:   '#6e915f', brightYellow:  '#836f4a',
      brightBlue:    '#6693bf', brightMagenta: '#624c83',
      brightCyan:    '#5e857a', brightWhite:   '#43436c',
    },
  },
  {
    id: 'hacker-blue',
    name: 'Hacker Blue',
    dark: true,
    preview: { bg: '#0a0e14', fg: '#b3b1ad', green: '#91b362', blue: '#59c2ff', red: '#ff3333', yellow: '#ffb454' },
    colors: {
      background:          '#0a0e14',
      foreground:          '#b3b1ad',
      cursor:              '#e6b450',
      cursorAccent:        '#0a0e14',
      selectionBackground: '#e6b45026',
      black:         '#01060e', red:           '#ea6c73',
      green:         '#91b362', yellow:        '#f9af4f',
      blue:          '#53bdfa', magenta:       '#fae994',
      cyan:          '#90e1c6', white:         '#c7c7c7',
      brightBlack:   '#686868', brightRed:     '#f07178',
      brightGreen:   '#c2d94c', brightYellow:  '#ffb454',
      brightBlue:    '#59c2ff', brightMagenta: '#ffee99',
      brightCyan:    '#95e6cb', brightWhite:   '#ffffff',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    dark: true,
    preview: { bg: '#282a36', fg: '#f8f8f2', green: '#50fa7b', blue: '#6272a4', red: '#ff5555', yellow: '#f1fa8c' },
    colors: {
      background:          '#282a36',
      foreground:          '#f8f8f2',
      cursor:              '#f8f8f2',
      cursorAccent:        '#282a36',
      selectionBackground: '#44475a',
      black:         '#21222c', red:           '#ff5555',
      green:         '#50fa7b', yellow:        '#f1fa8c',
      blue:          '#bd93f9', magenta:       '#ff79c6',
      cyan:          '#8be9fd', white:         '#f8f8f2',
      brightBlack:   '#6272a4', brightRed:     '#ff6e6e',
      brightGreen:   '#69ff94', brightYellow:  '#ffffa5',
      brightBlue:    '#d6acff', brightMagenta: '#ff92df',
      brightCyan:    '#a4ffff', brightWhite:   '#ffffff',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    dark: true,
    preview: { bg: '#2e3440', fg: '#d8dee9', green: '#a3be8c', blue: '#81a1c1', red: '#bf616a', yellow: '#ebcb8b' },
    colors: {
      background:          '#2e3440',
      foreground:          '#d8dee9',
      cursor:              '#d8dee9',
      cursorAccent:        '#2e3440',
      selectionBackground: '#4c566a',
      black:         '#3b4252', red:           '#bf616a',
      green:         '#a3be8c', yellow:        '#ebcb8b',
      blue:          '#81a1c1', magenta:       '#b48ead',
      cyan:          '#88c0d0', white:         '#e5e9f0',
      brightBlack:   '#4c566a', brightRed:     '#bf616a',
      brightGreen:   '#a3be8c', brightYellow:  '#ebcb8b',
      brightBlue:    '#81a1c1', brightMagenta: '#b48ead',
      brightCyan:    '#8fbcbb', brightWhite:   '#eceff4',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    dark: true,
    preview: { bg: '#272822', fg: '#f8f8f2', green: '#a6e22e', blue: '#66d9e8', red: '#f92672', yellow: '#e6db74' },
    colors: {
      background:          '#272822',
      foreground:          '#f8f8f2',
      cursor:              '#f8f8f2',
      cursorAccent:        '#272822',
      selectionBackground: '#49483e',
      black:         '#272822', red:           '#f92672',
      green:         '#a6e22e', yellow:        '#f4bf75',
      blue:          '#66d9e8', magenta:       '#ae81ff',
      cyan:          '#a1efe4', white:         '#f8f8f2',
      brightBlack:   '#75715e', brightRed:     '#f92672',
      brightGreen:   '#a6e22e', brightYellow:  '#f4bf75',
      brightBlue:    '#66d9e8', brightMagenta: '#ae81ff',
      brightCyan:    '#a1efe4', brightWhite:   '#f9f8f5',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    dark: true,
    preview: { bg: '#002b36', fg: '#839496', green: '#859900', blue: '#268bd2', red: '#dc322f', yellow: '#b58900' },
    colors: {
      background:          '#002b36',
      foreground:          '#839496',
      cursor:              '#839496',
      cursorAccent:        '#002b36',
      selectionBackground: '#073642',
      black:         '#073642', red:           '#dc322f',
      green:         '#859900', yellow:        '#b58900',
      blue:          '#268bd2', magenta:       '#d33682',
      cyan:          '#2aa198', white:         '#eee8d5',
      brightBlack:   '#002b36', brightRed:     '#cb4b16',
      brightGreen:   '#586e75', brightYellow:  '#657b83',
      brightBlue:    '#839496', brightMagenta: '#6c71c4',
      brightCyan:    '#93a1a1', brightWhite:   '#fdf6e3',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    dark: false,
    preview: { bg: '#fdf6e3', fg: '#657b83', green: '#859900', blue: '#268bd2', red: '#dc322f', yellow: '#b58900' },
    colors: {
      background:          '#fdf6e3',
      foreground:          '#657b83',
      cursor:              '#657b83',
      cursorAccent:        '#fdf6e3',
      selectionBackground: '#eee8d5',
      black:         '#073642', red:           '#dc322f',
      green:         '#859900', yellow:        '#b58900',
      blue:          '#268bd2', magenta:       '#d33682',
      cyan:          '#2aa198', white:         '#eee8d5',
      brightBlack:   '#002b36', brightRed:     '#cb4b16',
      brightGreen:   '#586e75', brightYellow:  '#657b83',
      brightBlue:    '#839496', brightMagenta: '#6c71c4',
      brightCyan:    '#93a1a1', brightWhite:   '#fdf6e3',
    },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    dark: true,
    preview: { bg: '#282c34', fg: '#abb2bf', green: '#98c379', blue: '#61afef', red: '#e06c75', yellow: '#e5c07b' },
    colors: {
      background:          '#282c34',
      foreground:          '#abb2bf',
      cursor:              '#528bff',
      cursorAccent:        '#282c34',
      selectionBackground: '#3e4451',
      black:         '#282c34', red:           '#e06c75',
      green:         '#98c379', yellow:        '#e5c07b',
      blue:          '#61afef', magenta:       '#c678dd',
      cyan:          '#56b6c2', white:         '#abb2bf',
      brightBlack:   '#5c6370', brightRed:     '#e06c75',
      brightGreen:   '#98c379', brightYellow:  '#e5c07b',
      brightBlue:    '#61afef', brightMagenta: '#c678dd',
      brightCyan:    '#56b6c2', brightWhite:   '#ffffff',
    },
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    dark: true,
    preview: { bg: '#282828', fg: '#ebdbb2', green: '#b8bb26', blue: '#83a598', red: '#cc241d', yellow: '#d79921' },
    colors: {
      background:          '#282828',
      foreground:          '#ebdbb2',
      cursor:              '#ebdbb2',
      cursorAccent:        '#282828',
      selectionBackground: '#504945',
      black:         '#282828', red:           '#cc241d',
      green:         '#98971a', yellow:        '#d79921',
      blue:          '#458588', magenta:       '#b16286',
      cyan:          '#689d6a', white:         '#a89984',
      brightBlack:   '#928374', brightRed:     '#fb4934',
      brightGreen:   '#b8bb26', brightYellow:  '#fabd2f',
      brightBlue:    '#83a598', brightMagenta: '#d3869b',
      brightCyan:    '#8ec07c', brightWhite:   '#ebdbb2',
    },
  },
]

export const DEFAULT_TERMINAL_THEME_ID = 'netcopilot'

export function getTerminalTheme(id: string): TerminalTheme {
  return TERMINAL_THEMES.find((t) => t.id === id) ?? TERMINAL_THEMES[0]
}
