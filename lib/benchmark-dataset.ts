export type BenchmarkDomain =
  | "smooth"
  | "geometric"
  | "landscape"
  | "portrait"
  | "sparse"
  | "texture";

export type BenchmarkDatasetItem = {
  id: string;
  label: string;
  domain: BenchmarkDomain;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

type PixelFn = (x: number, y: number) => [number, number, number];

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

function makeImage(width: number, height: number, pixel: PixelFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = pixel(x, y);
      data[i] = clamp(r);
      data[i + 1] = clamp(g);
      data[i + 2] = clamp(b);
      data[i + 3] = 255;
    }
  }
  return data;
}

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x + seed * 17, 374761393) ^ Math.imul(y + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function insideCircle(x: number, y: number, cx: number, cy: number, radius: number) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insideEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

function smoothAurora(width: number, height: number) {
  return makeImage(width, height, (x, y) => {
    const nx = x / Math.max(1, width - 1);
    const ny = y / Math.max(1, height - 1);
    const wave = Math.sin(nx * Math.PI * 2.2 + ny * 2.4) * 22;
    return [38 + nx * 175 + wave, 74 + ny * 122 - wave * 0.35, 152 + (1 - nx) * 72 + wave * 0.2];
  });
}

function geometricPoster(width: number, height: number) {
  return makeImage(width, height, (x, y) => {
    let color: [number, number, number] = [238, 226, 198];
    if (x > 7 && x < width * 0.48 && y > 9 && y < height * 0.58) color = [34, 45, 52];
    if (insideCircle(x, y, width * 0.7, height * 0.31, width * 0.17)) color = [221, 82, 47];
    if (x + y > width * 0.92 && x - y > width * 0.12) color = [43, 112, 93];
    if (y > height * 0.73) color = [194, 171, 111];
    return color;
  });
}

function duskLandscape(width: number, height: number) {
  return makeImage(width, height, (x, y) => {
    const ny = y / height;
    let color: [number, number, number] = [224 - ny * 72, 170 - ny * 48, 151 + ny * 30];
    const sun = insideCircle(x, y, width * 0.72, height * 0.24, width * 0.09);
    if (sun) color = [252, 225, 158];
    const ridgeA = y > height * 0.46 + Math.abs(x - width * 0.28) * 0.42;
    const ridgeB = y > height * 0.53 + Math.abs(x - width * 0.67) * 0.33;
    if (ridgeA) color = [83, 77, 84];
    if (ridgeB) color = [52, 67, 66];
    if (y > height * 0.82) color = [40, 55, 48];
    return color;
  });
}

function softPortrait(width: number, height: number) {
  return makeImage(width, height, (x, y) => {
    let color: [number, number, number] = [206, 193, 178];
    if (insideEllipse(x, y, width * 0.5, height * 0.5, width * 0.27, height * 0.36)) color = [211, 159, 125];
    if (insideEllipse(x, y, width * 0.5, height * 0.29, width * 0.3, height * 0.18)) color = [58, 48, 46];
    if (insideEllipse(x, y, width * 0.39, height * 0.47, width * 0.035, height * 0.022)) color = [44, 40, 39];
    if (insideEllipse(x, y, width * 0.61, height * 0.47, width * 0.035, height * 0.022)) color = [44, 40, 39];
    if (insideEllipse(x, y, width * 0.5, height * 0.63, width * 0.09, height * 0.025)) color = [145, 67, 61];
    if (y > height * 0.78 && Math.abs(x - width * 0.5) < width * 0.31) color = [67, 84, 105];
    return color;
  });
}

function sparseGlyphs(width: number, height: number) {
  return makeImage(width, height, (x, y) => {
    let color: [number, number, number] = [246, 244, 237];
    if (insideCircle(x, y, width * 0.25, height * 0.28, width * 0.1)) color = [23, 25, 27];
    if (x > width * 0.48 && x < width * 0.78 && y > height * 0.18 && y < height * 0.39) color = [205, 62, 50];
    const diagonal = Math.abs((y - height * 0.63) - (x - width * 0.16) * 0.48) < 2.2;
    if (diagonal && x > width * 0.14 && x < width * 0.7) color = [38, 96, 147];
    if (insideEllipse(x, y, width * 0.76, height * 0.74, width * 0.13, height * 0.07)) color = [218, 176, 59];
    return color;
  });
}

function wovenTexture(width: number, height: number) {
  return makeImage(width, height, (x, y) => {
    const noise = hashNoise(x, y, 19);
    const stripes = ((Math.floor(x / 4) + Math.floor(y / 5)) % 2) * 38;
    const fine = Math.sin(x * 1.6) * 16 + Math.cos(y * 1.35) * 13;
    return [86 + stripes + fine + noise * 45, 104 + stripes * 0.45 + noise * 38, 118 + (1 - noise) * 52 - fine * 0.3];
  });
}

function checkerStudy(width: number, height: number) {
  return makeImage(width, height, (x, y) => {
    const cell = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    const accent = insideCircle(x, y, width * 0.5, height * 0.5, width * 0.22);
    if (accent) return [211, 78, 55];
    return cell ? [38, 43, 47] : [228, 221, 204];
  });
}

function mistyBands(width: number, height: number) {
  return makeImage(width, height, (x, y) => {
    const nx = x / width;
    const ny = y / height;
    const ridge = Math.sin(nx * Math.PI * 3) * 0.08 + 0.52;
    if (ny > ridge + 0.14) return [48, 76, 72];
    if (ny > ridge) return [92, 119, 111];
    return [184 + ny * 25, 202 + ny * 18, 207 + nx * 16];
  });
}

export function createBuiltInBenchmarkDataset(width = 64, height = 64): BenchmarkDatasetItem[] {
  return [
    { id: "smooth-aurora", label: "Smooth aurora", domain: "smooth", width, height, pixels: smoothAurora(width, height) },
    { id: "geometric-poster", label: "Geometric poster", domain: "geometric", width, height, pixels: geometricPoster(width, height) },
    { id: "dusk-landscape", label: "Dusk landscape", domain: "landscape", width, height, pixels: duskLandscape(width, height) },
    { id: "soft-portrait", label: "Soft portrait", domain: "portrait", width, height, pixels: softPortrait(width, height) },
    { id: "sparse-glyphs", label: "Sparse glyphs", domain: "sparse", width, height, pixels: sparseGlyphs(width, height) },
    { id: "woven-texture", label: "Woven texture", domain: "texture", width, height, pixels: wovenTexture(width, height) },
    { id: "checker-study", label: "Checker study", domain: "geometric", width, height, pixels: checkerStudy(width, height) },
    { id: "misty-bands", label: "Misty bands", domain: "landscape", width, height, pixels: mistyBands(width, height) },
  ];
}
