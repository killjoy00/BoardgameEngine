import { readFile } from "node:fs/promises";

const files = ["index.html", "privacy.html", "terms.html", "styles.css", "app.js"];
const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
const requiredLinks = ["styles.css", "app.js", "privacy.html", "terms.html", "docs/PROJECT_CHARTER.md"];
const missing = requiredLinks.filter((link) => !contents.some((content) => content.includes(link)));

if (missing.length) {
  console.error(`Missing required references: ${missing.join(", ")}`);
  process.exit(1);
}

if (contents.some((content) => /href=""|src=""/.test(content))) {
  console.error("Empty asset or navigation reference found.");
  process.exit(1);
}

console.log(`Checked ${files.length} public-site files and ${requiredLinks.length} required references.`);
