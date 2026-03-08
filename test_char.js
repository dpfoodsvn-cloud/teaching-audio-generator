// Quick test - check what character the separator actually is
const testLine = " ───────────────────────────────────────────────────";
console.log("Separator test:");
console.log("  Char code at pos 1:", testLine.charCodeAt(1));
console.log("  Char code at pos 2:", testLine.charCodeAt(2));
console.log("  Character:", testLine.charAt(1));
console.log("  Regex /^─+$/ matches:", testLine.trim().match(/^─+$/) !== null);
console.log("  Regex /^-+$/ matches:", testLine.trim().match(/^-+$/) !== null);
console.log("  Regex /^[─−-]+$/ matches:", testLine.trim().match(/^[─−-]+$/) !== null);
