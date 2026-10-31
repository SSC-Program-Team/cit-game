// Fetch one CSDI dataset for the Stanley map box and copy it to the clipboard, to paste into chat.
//
// How: open the dataset's page on portal.csdi.gov.hk, or its FeatureServer address, in the browser,
// open the console (Cmd+Option+J), paste all of this and press Enter. When it says "copied", paste
// into the chat. It lists the layers and counts first, so a failure says why.
//
// It uses the dataset's ArcGIS REST service (…/server/rest/services/common/<id>/FeatureServer).
// On the dataset's page it works that out by itself; anywhere else, put the address in SERVICE.
(async () => {
  let SERVICE = ''; // e.g. https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1637222018065_52265/FeatureServer
  const BOX = { s: 22.2105, n: 22.2235, w: 114.2045, e: 114.2200 }; // the game map (stanley-expansion.md §2)
  if (!SERVICE && /\/(Feature|Map)Server/.test(location.pathname)) SERVICE = location.href.replace(/\/(Feature|Map)Server.*$/, '/$1Server');
  if (!SERVICE) {
    const id = (location.pathname.match(/dataset\/([^/?#]+)/) || [])[1];
    if (!id) return console.error('Open the dataset page first (…/csdi-webpage/dataset/<id>), or set SERVICE.');
    SERVICE = `${location.origin}/server/rest/services/common/${id}/FeatureServer`;
  }
  SERVICE = SERVICE.split('?')[0].replace(/\/+$/, '');
  const ds = (SERVICE.match(/common\/([^/]+)/) || [])[1] || SERVICE;
  const json = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const j = await r.json();
    if (j.error) throw new Error(`${j.error.code} ${j.error.message}`);
    return j;
  };

  // 1. the service's layers
  // (the browsable "Services Directory" can be switched off; then ask for layers 0 to 9 directly)
  let layers;
  try { const info = await json(`${SERVICE}?f=json`); layers = [...(info.layers || []), ...(info.tables || [])]; }
  catch (e) {
    console.warn(`Layer list not available (${e.message}); trying layers 0 to 9.`);
    layers = Array.from({ length: 10 }, (_, id) => ({ id, name: `layer${id}` }));
  }
  console.log(`${ds}: ${layers.length} layers`, layers.map((l) => `${l.id} ${l.name}`));

  // 2. each layer's features that touch the box, as GeoJSON in longitude/latitude, a page at a time
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const flat = (c) => (typeof c[0] !== 'number' ? c.map(flat) : c.length > 2 ? [r6(c[0]), r6(c[1]), Math.round(c[2] * 10) / 10] : [r6(c[0]), r6(c[1])]);
  const out = { ds, box: BOX, layers: {} };
  for (const L of layers) {
    let meta = {};
    try { meta = await json(`${SERVICE}/${L.id}?f=json`); if (meta.name) L.name = meta.name; } catch { /* use the defaults */ }
    const page = Math.min(meta.maxRecordCount || 1000, 2000);
    const feats = [];
    for (let offset = 0; offset < 100000; offset += page) {
      const q = new URLSearchParams({
        where: '1=1', outFields: '*', f: 'geojson', returnZ: 'true',
        geometry: `${BOX.w},${BOX.s},${BOX.e},${BOX.n}`, geometryType: 'esriGeometryEnvelope', inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects', outSR: '4326', resultOffset: String(offset), resultRecordCount: String(page),
      });
      let j;
      try { j = await json(`${SERVICE}/${L.id}/query?${q}`); }
      catch (e) { if (!/^layer\d$/.test(L.name) || !/400|404|not found|invalid/i.test(e.message)) console.warn(`  ${L.id} ${L.name}: ${e.message}`); break; }
      feats.push(...(j.features || []));
      if (!j.features || j.features.length < page) break;
    }
    if (!feats.length) { console.log(`  ${L.id} ${L.name}: none in the box`); continue; }
    // properties as one key list plus a row of values per feature, to keep the paste small
    const keys = [...new Set(feats.flatMap((f) => Object.keys(f.properties || {})))]
      .filter((k) => !/^(objectid|fid|shape_?(length|area|_len)|shape\.(stlength|starea)\(\)|globalid)$/i.test(k));
    out.layers[`${L.id} ${L.name}`] = {
      geom: meta.geometryType || '', keys,
      f: feats.filter((f) => f.geometry).map((f) => [flat(f.geometry.coordinates), keys.map((k) => f.properties?.[k] ?? null)]),
    };
    console.log(`  ${L.id} ${L.name}: ${feats.length} features; fields ${keys.join(', ')}`);
  }

  // big results go in parts of about 400 KB, so each paste fits in a chat message
  const text = JSON.stringify(out), PART = 400000;
  window.csdiParts = [];
  for (let i = 0; i < text.length; i += PART) window.csdiParts.push(`[part ${window.csdiParts.length + 1}/${Math.ceil(text.length / PART)}]` + text.slice(i, i + PART));
  copy(window.csdiParts[0]);
  console.log(`${Math.round(text.length / 1024)} KB in ${window.csdiParts.length} part(s). Part 1 is copied: paste it into the chat.` +
    (window.csdiParts.length > 1 ? ' Then run copy(csdiParts[1]) for part 2, and so on.' : ''));
})();
