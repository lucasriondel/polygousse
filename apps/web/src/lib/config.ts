const API_HOST = import.meta.env.VITE_API_HOST ?? "localhost:5616";
const PTY_HOST = import.meta.env.VITE_PTY_HOST ?? "localhost:5617";

export const API_BASE_URL = `http://${API_HOST}/api`;
export const WS_URL = `ws://${API_HOST}/api/ws`;
export const PTY_WS_URL = `ws://${PTY_HOST}/ws/terminal`;
