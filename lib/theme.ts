// Shared by the toggle (client) and the root layout (server). Server files
// can't import plain values from a "use client" module, so they live here.
export const THEME_KEY = "cw-theme";

/** Runs before first paint (inlined in <head>), so a saved theme never flashes. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
