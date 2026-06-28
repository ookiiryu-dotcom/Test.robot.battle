export function colorFromHex(hex) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getChunkCoord(value, chunkSize) {
  return Math.floor((value + chunkSize / 2) / chunkSize);
}

export function getChunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export function hash2D(x, z) {
  let h = x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

export function randomFromSeed(seed) {
  let value = seed >>> 0;

  return function random() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
