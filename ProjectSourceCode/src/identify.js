// src/identify.js — NEW FILE
// Pl@ntNet identify logic, extracted from src/resources/js/plant_name_index.js.
// That file is a standalone server — do NOT import it into index.js.
// This module has no express app and no app.listen(), so index.js stays
// the only server. It only exports: upload, parsePlantNetResponse,
// identifyWithPlantNet.
//
// Usage in src/index.js (PROTECTED ROUTES section):
//   const { upload, identifyWithPlantNet } = require('./identify');
//   const { getPlantDescription } = require('./plantHelpers');
//
// Requires in .env: PLANTNET_API_KEY
// Requires in package.json (already there): multer, dotenv (via index.js)

const multer = require('multer');
const path = require('path');

const ALLOWED_ORGANS = ['leaf', 'flower', 'fruit', 'bark', 'auto'];

// Save the uploaded photo to disk so the Bloomdex can show it later.
// Files land in src/resources/uploads/ and are served at /resources/uploads/...
// because index.js already does app.use('/resources', express.static(.../resources)).
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'resources', 'uploads'),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // Pl@ntNet cap is 50 MB total; 10 MB/photo is plenty
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images are allowed (Pl@ntNet rule).'));
    }
  },
});

// Turn Pl@ntNet's raw response into the fields the app actually uses.
// Parsed result: bestMatch, commonName, scientificName, family, genus,
// confidence (0-1) and confidencePercent, predictedOrgan, a short
// alternatives list, and remainingIdentificationRequests.
// Example (Blue fescue photo):
//   bestMatch: "Festuca glauca Vill.", commonName: "Blue fescue",
//   confidence: 0.93893, confidencePercent: 93.9,
//   remainingIdentificationRequests: 499
function parsePlantNetResponse(data) {
  const top = (data.results && data.results[0]) || null;
  const species = (top && top.species) || {};
  return {
    bestMatch: data.bestMatch || null,
    scientificName: species.scientificName || data.bestMatch || null,
    commonName: (species.commonNames && species.commonNames[0]) || null,
    commonNames: species.commonNames || [],
    genus: (species.genus && species.genus.scientificNameWithoutAuthor) || null,
    family: (species.family && species.family.scientificNameWithoutAuthor) || null,
    confidence: top ? top.score : null,
    confidencePercent: top ? Math.round(top.score * 1000) / 10 : null,
    predictedOrgan: (data.predictedOrgans && data.predictedOrgans[0] && data.predictedOrgans[0].organ) || null,
    alternatives: (data.results || []).slice(1).map((r) => ({
      scientificName: r.species && r.species.scientificName,
      commonName: (r.species && r.species.commonNames && r.species.commonNames[0]) || null,
      score: r.score,
    })),
    remainingIdentificationRequests: data.remainingIdentificationRequests,
  };
}

// Shared core: one uploaded file -> parsed Pl@ntNet result (see above).
// file is a multer file object (disk storage: file.path, file.filename,
// file.mimetype, file.originalname). Throws an Error with .status for
// Pl@ntNet rejections, so both the HTML route and the JSON route can
// report it in their own format.
async function identifyWithPlantNet(file, organ) {
  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) {
    const err = new Error('PLANTNET_API_KEY is not set in .env.');
    err.status = 500;
    throw err;
  }
  const chosenOrgan = ALLOWED_ORGANS.includes(organ) ? organ : 'auto';

  // Read the saved file back as a buffer for the Pl@ntNet multipart body.
  const fs = require('fs');
  const buffer = fs.readFileSync(file.path);

  const form = new FormData();
  form.append('images', new Blob([buffer], { type: file.mimetype }), file.originalname);
  form.append('organs', chosenOrgan);
  const url = 'https://my-api.plantnet.org/v2/identify/all'
    + `?api-key=${apiKey}&nb-results=5&lang=en`;
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Pl@ntNet rejected the request.');
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return parsePlantNetResponse(data);
}

module.exports = { upload, parsePlantNetResponse, identifyWithPlantNet };
