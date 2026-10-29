// npm run check:contrast: WCAG 2.x contrast for every text/background pair
// the UI uses, in both themes. Body text needs 4.5:1; large text and UI
// parts (borders of inputs, focus ring) need 3:1.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const themes = {
  light: { page: "#ffffff", card: "#f7f5fb", ink: "#111114", muted: "#4b4757", brand: "#3d1e78", brandBtn: "#3d1e78", onBrand: "#ffffff", brandSoft: "#ece6f7", strong: "#111114", footer: "#111114", footerFg: "#f4f2f8" },
  dark: { page: "#0e0b14", card: "#17121f", ink: "#f4f2f8", muted: "#b9b2c9", brand: "#b79cff", brandBtn: "#6b3fcc", onBrand: "#ffffff", brandSoft: "#2a1f42", strong: "#f4f2f8", footer: "#000000", footerFg: "#f4f2f8" },
};
const code = { bg: "#000000", fg: "#ffffff", muted: "#a9a3b8", add: "#2d1a5c", del: "#2a2830", focus: "#b79cff" };

let failures = 0;
function pair(label, fg, bg, min) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${label}`);
}

for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`);
  pair("text on page", t.ink, t.page, 4.5);
  pair("text on card", t.ink, t.card, 4.5);
  pair("secondary text on page", t.muted, t.page, 4.5);
  pair("secondary text on card", t.muted, t.card, 4.5);
  pair("link on page", t.brand, t.page, 4.5);
  pair("link on card", t.brand, t.card, 4.5);
  pair("button text on primary button", t.onBrand, t.brandBtn, 4.5);
  pair("selected tab text", t.onBrand, t.brandBtn, 4.5);
  pair("text on brand-soft chip", t.ink, t.brandSoft, 4.5);
  pair("focus ring vs page", t.brand, t.page, 3);
  pair("strong border vs page", t.strong, t.page, 3);
  pair("footer text", t.footerFg, t.footer, 4.5);
}
console.log("\ncode panels (both themes)");
pair("code text", code.fg, code.bg, 4.5);
pair("line numbers", code.muted, code.bg, 4.5);
pair("added-line text", code.fg, code.add, 4.5);
pair("removed-line text", code.fg, code.del, 4.5);
pair("line numbers on added line", code.muted, code.add, 4.5);
pair("focus ring inside code panel", code.focus, code.bg, 3);

console.log(failures ? `\n${failures} pair(s) below the minimum` : "\nAll pairs pass.");
process.exit(failures ? 1 : 0);
