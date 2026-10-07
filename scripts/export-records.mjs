import fs from "node:fs/promises";
import { loadContent, archiveText } from "./archive-content.mjs";

// Validate the entire input before writing any downloads.
const { records } = await loadContent();
const output = new URL("../public/archives/", import.meta.url);
await fs.mkdir(output, { recursive: true });
for (const name of await fs.readdir(output)) {
  if (/^RHINE-LAB-X-\d{3}\.txt$/i.test(name)) await fs.rm(new URL(name, output));
}
for (const record of records) {
  await fs.writeFile(
    new URL(`CAREER-PLANNER-${record.id}.txt`, output),
    archiveText(record),
    "utf8",
  );
}
console.log(`Prepared ${records.length} downloadable archive records.`);
