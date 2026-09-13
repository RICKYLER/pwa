// Dev-only diagnostic: verifies which CARTO basemap tile URL formats work
// with the configured NEXT_PUBLIC_CARTO_API_KEY (cb1_… platform key).
// Usage: node scripts/probe-carto.mjs
const key = process.env.NEXT_PUBLIC_CARTO_API_KEY ?? 'cb1_3il1_1_ae4bc556f4730db15a1074bd';
const Z = 10, X = 512, Y = 336; // a tile over Mindanao

const variants = [
  { label: 'rastertiles/positron + ?key=', url: (k) => `https://a.basemaps.cartocdn.com/rastertiles/positron/${Z}/${X}/${Y}.png?key=${k}` },
  { label: 'rastertiles/positron @2x + ?key=', url: (k) => `https://a.basemaps.cartocdn.com/rastertiles/positron/${Z}/${X}/${Y}@2x.png?key=${k}` },
  { label: 'rastertiles/positron no key', url: () => `https://a.basemaps.cartocdn.com/rastertiles/positron/${Z}/${X}/${Y}.png` },
  { label: 'light_all (legacy) + ?key=', url: (k) => `https://a.basemaps.cartocdn.com/light_all/${Z}/${X}/${Y}.png?key=${k}` },
  { label: 'rastertiles/voyager + ?key=', url: (k) => `https://a.basemaps.cartocdn.com/rastertiles/voyager/${Z}/${X}/${Y}.png?key=${k}` },
  { label: 'rastertiles/positron + ?api_key=', url: (k) => `https://a.basemaps.cartocdn.com/rastertiles/positron/${Z}/${X}/${Y}.png?api_key=${k}` },
];

async function main() {
  for (const variant of variants) {
    const url = variant.url(key);
    try {
      const res = await fetch(url);
      if (res.status !== 200) {
        console.log(`HTTP ${res.status} | ${variant.label}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      const sig = new Uint8Array(buf.slice(0, 4));
      const isPng = sig[0] === 0x89 && sig[1] === 0x50;
      console.log(`HTTP 200 ${isPng ? 'PNG' : res.headers.get('content-type')} ${buf.byteLength}B | ${variant.label}`);
    } catch (error) {
      console.log(`ERR       | ${variant.label} | ${error.message}`);
    }
  }
}

main();
