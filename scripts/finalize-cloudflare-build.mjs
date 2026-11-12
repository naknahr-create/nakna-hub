import { readFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Wrangler must start from the root config so every bare deploy builds fresh.
// Keep the generated Worker config itself for explicit deploy/preview commands.
const pointerPath = fileURLToPath(new URL("../.wrangler/deploy/config.json", import.meta.url));
const workerConfigPath = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));

let contents;
try {
  contents = await readFile(pointerPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (contents !== undefined) {
  const pointer = JSON.parse(contents);
  if (
    typeof pointer.configPath !== "string" ||
    resolve(dirname(pointerPath), pointer.configPath) !== workerConfigPath ||
    (pointer.auxiliaryWorkers !== undefined &&
      (!Array.isArray(pointer.auxiliaryWorkers) || pointer.auxiliaryWorkers.length !== 0))
  ) {
    throw new Error("Unexpected Wrangler deployment redirect; left it unchanged. Review .wrangler/deploy/config.json before deploying.");
  }
  await unlink(pointerPath);
}
