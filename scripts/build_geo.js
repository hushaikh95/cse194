// Extracts California counties from us-atlas into data/ca-counties.json
const topo = require('us-atlas/counties-10m.json');
const { feature } = require('topojson-client');
const fs = require('fs');
const all = feature(topo, topo.objects.counties);
const ca = { type: 'FeatureCollection',
  features: all.features.filter(f => f.id.startsWith('06'))
    .map(f => ({ type:'Feature', id:f.id, properties:{ fips:f.id, name:f.properties.name }, geometry:f.geometry })) };
const round = a => Array.isArray(a[0]) ? a.map(round) : a.map(v => Math.round(v*1e4)/1e4);
ca.features.forEach(f => f.geometry.coordinates = round(f.geometry.coordinates));
fs.writeFileSync(process.argv[2], JSON.stringify(ca));
console.log(ca.features.length, 'counties');
console.log(ca.features.map(f=>f.properties.name).sort().join(', '));
