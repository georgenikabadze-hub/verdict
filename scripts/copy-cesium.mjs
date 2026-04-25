import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const cesiumBuildDir = join(
  process.cwd(),
  "node_modules",
  "cesium",
  "Build",
  "Cesium",
);
const publicCesiumDir = join(process.cwd(), "public", "cesium");
const assetDirs = ["Workers", "ThirdParty", "Assets", "Widgets"];

await mkdir(publicCesiumDir, { recursive: true });

await Promise.all(
  assetDirs.map((dir) =>
    cp(join(cesiumBuildDir, dir), join(publicCesiumDir, dir), {
      recursive: true,
    }),
  ),
);

console.log(`Copied Cesium assets to ${publicCesiumDir}`);
