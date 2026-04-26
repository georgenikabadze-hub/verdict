function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unitFloat(seed: string): number {
  return fnv1a32(seed) / 0xffffffff;
}

export function deterministicBlur(
  seed: string,
  exactLat: number,
  exactLng: number,
): { lat: number; lng: number } {
  const r1 = unitFloat(`${seed}:distance`);
  const r2 = unitFloat(`${seed}:angle`);
  const distance = 250 + r1 * 250;
  const angle = r2 * Math.PI * 2;
  const cosLat = Math.cos((exactLat * Math.PI) / 180);
  const safeCosLat = Math.max(0.01, Math.abs(cosLat));

  const dLat = (distance * Math.cos(angle)) / 111_320;
  const dLng = (distance * Math.sin(angle)) / (111_320 * safeCosLat);

  return { lat: exactLat + dLat, lng: exactLng + dLng };
}
