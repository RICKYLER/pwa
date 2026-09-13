// Dev-only diagnostic: probes the GeoRisk/PSA ArcGIS barangay layer.
// Usage: node scripts/probe-georisk.mjs
const LAYER = 'https://ulap-nga.georisk.gov.ph/arcgis/rest/services/PSA/BarangayPopMF/MapServer/0';

const MABINI_PSGCS = [
  '1108203002', '1108203006', '1108203007', '1108203011', '1108203012',
  '1108203013', '1108203014', '1108203015', '1108203016', '1108203017', '1108203018',
];

async function main() {
  // 1. Layer metadata
  const metaRes = await fetch(`${LAYER}?f=pjson`);
  console.log('metadata HTTP', metaRes.status);
  const meta = await metaRes.json();
  console.log('layer:', meta.name, '| geometryType:', meta.geometryType);
  console.log('fields:', (meta.fields ?? []).map((f) => `${f.name}:${f.type}`).join(', '));
  console.log('extentSR:', JSON.stringify(meta.extent?.spatialReference));
  console.log('maxRecordCount:', meta.maxRecordCount, '| formats:', meta.supportedQueryFormats);

  const fieldNames = (meta.fields ?? []).map((f) => f.name);
  const psgcField = fieldNames.find((n) => /^psgc_10d$/i.test(n)) ?? fieldNames.find((n) => /^psgc$/i.test(n));

  // 2. Query by PSGC IN
  const queries = [];
  if (psgcField) {
    queries.push({
      label: `${psgcField} IN (11 PSGCs)`,
      params: { where: `${psgcField} IN (${MABINI_PSGCS.map((p) => `'${p}'`).join(',')})` },
    });
  }
  queries.push({ label: 'city_code = 1108203000', params: { where: "city_code = '1108203000'" } });
  queries.push({
    label: 'city_name = Mabini (both province names)',
    params: { where: "city_name = 'Mabini' AND (prov_name = 'Davao de Oro' OR prov_name = 'Compostela Valley')" },
  });

  for (const attempt of queries) {
    const params = new URLSearchParams({
      f: 'geojson',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '200',
      ...attempt.params,
    });
    const url = `${LAYER}/query?${params.toString()}`;
    try {
      const res = await fetch(url);
      const body = await res.json();
      if (body.error) {
        console.log(`\n[${attempt.label}] HTTP ${res.status} — ArcGIS error: ${body.error.message}`);
        continue;
      }
      const features = body.features ?? [];
      console.log(`\n[${attempt.label}] HTTP ${res.status} — ${features.length} features`);
      features.forEach((feature) => {
        const props = feature.properties ?? {};
        const name = props.brgy_name ?? props.Bgy_Name ?? props.name ?? '?';
        const psgc = props.psgc_10d ?? props.PSGC ?? props.psgc ?? '?';
        const geomType = feature.geometry?.type ?? 'none';
        const coords = feature.geometry?.coordinates ?? feature.geometry?.rings ?? [];
        console.log(`  ${name} | psgc=${psgc} | ${geomType} | parts=${coords.length} | area=${props.bgyarea_sqkm ?? '—'}`);
      });
      if (features.length > 0) {
        console.log('\nSUCCESS with:', attempt.label);
        console.log('URL:', url);
        return;
      }
    } catch (error) {
      console.log(`\n[${attempt.label}] fetch failed: ${error.message}`);
    }
  }
  console.log('\nAll query attempts failed or returned zero features.');
}

main().catch((error) => {
  console.error('PROBE FAILED:', error.message);
  process.exit(1);
});
