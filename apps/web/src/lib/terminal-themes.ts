import type { ITheme } from "@xterm/xterm";

export interface TerminalTheme {
	name: string;
	theme: ITheme;
}

const defaultTheme: TerminalTheme = {
	name: "Default",
	theme: {
		background: "#18262F",
		foreground: "#e0e0e0",
		cursor: "#e0e0e0",
		selectionBackground: "#3a4a54",
		black: "#000000",
		red: "#e06c75",
		green: "#98c379",
		yellow: "#e5c07b",
		blue: "#61afef",
		magenta: "#c678dd",
		cyan: "#56b6c2",
		white: "#abb2bf",
		brightBlack: "#5c6370",
		brightRed: "#e06c75",
		brightGreen: "#98c379",
		brightYellow: "#e5c07b",
		brightBlue: "#61afef",
		brightMagenta: "#c678dd",
		brightCyan: "#56b6c2",
		brightWhite: "#ffffff",
	},
};

const dracula: TerminalTheme = {
	name: "Dracula",
	theme: {
		background: "#282a36",
		foreground: "#f8f8f2",
		cursor: "#f8f8f2",
		selectionBackground: "#44475a",
		black: "#21222c",
		red: "#ff5555",
		green: "#50fa7b",
		yellow: "#f1fa8c",
		blue: "#bd93f9",
		magenta: "#ff79c6",
		cyan: "#8be9fd",
		white: "#f8f8f2",
		brightBlack: "#6272a4",
		brightRed: "#ff6e6e",
		brightGreen: "#69ff94",
		brightYellow: "#ffffa5",
		brightBlue: "#d6acff",
		brightMagenta: "#ff92df",
		brightCyan: "#a4ffff",
		brightWhite: "#ffffff",
	},
};

const nord: TerminalTheme = {
	name: "Nord",
	theme: {
		background: "#2e3440",
		foreground: "#d8dee9",
		cursor: "#d8dee9",
		selectionBackground: "#434c5e",
		black: "#3b4252",
		red: "#bf616a",
		green: "#a3be8c",
		yellow: "#ebcb8b",
		blue: "#81a1c1",
		magenta: "#b48ead",
		cyan: "#88c0d0",
		white: "#e5e9f0",
		brightBlack: "#4c566a",
		brightRed: "#bf616a",
		brightGreen: "#a3be8c",
		brightYellow: "#ebcb8b",
		brightBlue: "#81a1c1",
		brightMagenta: "#b48ead",
		brightCyan: "#8fbcbb",
		brightWhite: "#eceff4",
	},
};

const solarizedDark: TerminalTheme = {
	name: "Solarized Dark",
	theme: {
		background: "#002b36",
		foreground: "#839496",
		cursor: "#839496",
		selectionBackground: "#073642",
		black: "#073642",
		red: "#dc322f",
		green: "#859900",
		yellow: "#b58900",
		blue: "#268bd2",
		magenta: "#d33682",
		cyan: "#2aa198",
		white: "#eee8d5",
		brightBlack: "#586e75",
		brightRed: "#cb4b16",
		brightGreen: "#586e75",
		brightYellow: "#657b83",
		brightBlue: "#839496",
		brightMagenta: "#6c71c4",
		brightCyan: "#93a1a1",
		brightWhite: "#fdf6e3",
	},
};

const solarizedLight: TerminalTheme = {
	name: "Solarized Light",
	theme: {
		background: "#fdf6e3",
		foreground: "#657b83",
		cursor: "#657b83",
		selectionBackground: "#eee8d5",
		black: "#073642",
		red: "#dc322f",
		green: "#859900",
		yellow: "#b58900",
		blue: "#268bd2",
		magenta: "#d33682",
		cyan: "#2aa198",
		white: "#eee8d5",
		brightBlack: "#002b36",
		brightRed: "#cb4b16",
		brightGreen: "#586e75",
		brightYellow: "#657b83",
		brightBlue: "#839496",
		brightMagenta: "#6c71c4",
		brightCyan: "#93a1a1",
		brightWhite: "#fdf6e3",
	},
};

const monokai: TerminalTheme = {
	name: "Monokai",
	theme: {
		background: "#272822",
		foreground: "#f8f8f2",
		cursor: "#f8f8f0",
		selectionBackground: "#49483e",
		black: "#272822",
		red: "#f92672",
		green: "#a6e22e",
		yellow: "#f4bf75",
		blue: "#66d9ef",
		magenta: "#ae81ff",
		cyan: "#a1efe4",
		white: "#f8f8f2",
		brightBlack: "#75715e",
		brightRed: "#f92672",
		brightGreen: "#a6e22e",
		brightYellow: "#f4bf75",
		brightBlue: "#66d9ef",
		brightMagenta: "#ae81ff",
		brightCyan: "#a1efe4",
		brightWhite: "#f9f8f5",
	},
};

const oneDark: TerminalTheme = {
	name: "One Dark",
	theme: {
		background: "#282c34",
		foreground: "#abb2bf",
		cursor: "#528bff",
		selectionBackground: "#3e4451",
		black: "#282c34",
		red: "#e06c75",
		green: "#98c379",
		yellow: "#e5c07b",
		blue: "#61afef",
		magenta: "#c678dd",
		cyan: "#56b6c2",
		white: "#abb2bf",
		brightBlack: "#5c6370",
		brightRed: "#e06c75",
		brightGreen: "#98c379",
		brightYellow: "#e5c07b",
		brightBlue: "#61afef",
		brightMagenta: "#c678dd",
		brightCyan: "#56b6c2",
		brightWhite: "#ffffff",
	},
};

const githubDark: TerminalTheme = {
	name: "GitHub Dark",
	theme: {
		background: "#0d1117",
		foreground: "#c9d1d9",
		cursor: "#c9d1d9",
		selectionBackground: "#264f78",
		black: "#484f58",
		red: "#ff7b72",
		green: "#3fb950",
		yellow: "#d29922",
		blue: "#58a6ff",
		magenta: "#bc8cff",
		cyan: "#39c5cf",
		white: "#b1bac4",
		brightBlack: "#6e7681",
		brightRed: "#ffa198",
		brightGreen: "#56d364",
		brightYellow: "#e3b341",
		brightBlue: "#79c0ff",
		brightMagenta: "#d2a8ff",
		brightCyan: "#56d4dd",
		brightWhite: "#f0f6fc",
	},
};

export const terminalThemes: Record<string, TerminalTheme> = {
	default: defaultTheme,
	dracula,
	nord,
	"solarized-dark": solarizedDark,
	"solarized-light": solarizedLight,
	monokai,
	"one-dark": oneDark,
	"github-dark": githubDark,
};

export const terminalThemeList: TerminalTheme[] = Object.values(terminalThemes);

export function getTerminalTheme(key: string): ITheme {
	return terminalThemes[key]?.theme ?? defaultTheme.theme;
}
