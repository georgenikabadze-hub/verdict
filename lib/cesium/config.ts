export const CESIUM_BASE_URL =
  process.env.NEXT_PUBLIC_CESIUM_BASE_URL ?? "/cesium";

export const TILES_3D_URL = "https://tile.googleapis.com/v1/3dtiles/root.json";

export function tilesetUrl(key: string): string {
  return `${TILES_3D_URL}?key=${encodeURIComponent(key)}`;
}
