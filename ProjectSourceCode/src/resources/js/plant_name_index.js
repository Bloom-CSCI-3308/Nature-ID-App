require('dotenv').config();

const express = require('express');
const exphbs = require('express-handlebars');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ORGANS = ['leaf', 'flower', 'fruit', 'bark', 'auto'];

app.engine('hbs', exphbs.engine({
  extname: 'hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views', 'layouts'),
  partialsDir: path.join(__dirname, 'views', 'partials'),
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'resources')));

// Pl@ntNet's own cap is 50 MB total; 10 MB for one photo is plenty here.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images are allowed (Pl@ntNet rule).'));
    }
  },
});

// Turn Pl@ntNet's raw response into the fields the app actually uses.
// Raw response: bestMatch + results[] with nested species/genus/family,
// plus gbif/powo ids, version, language, etc.
// Parsed result: one flat object — bestMatch, commonName, scientificName,
// family, genus, confidence (0-1) and confidencePercent, predictedOrgan,
// a short alternatives list, and remainingIdentificationRequests.
// Example (your blue grass photo):
//   bestMatch: "Festuca glauca Vill.", commonName: "Blue fescue",
//   confidence: 0.93893, confidencePercent: 93.9,
//   alternatives: [{ scientificName: "Corynephorus canescens (L.) P.Beauv.",
//     commonName: "Grey Hair Grass", score: 0.00572 }, ...]
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

// Shared core: one photo buffer -> parsed Pl@ntNet result (see above).
// Throws an Error with .status for Pl@ntNet rejections, so both the
// HTML route and the JSON route can report it in their own format.
async function identifyWithPlantNet(file, organ) {
  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) {
    const err = new Error('PLANTNET_API_KEY is not set in .env.');
    err.status = 500;
    throw err;
  }
  const chosenOrgan = ALLOWED_ORGANS.includes(organ) ? organ : 'auto';
  const form = new FormData();
  form.append('images', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  form.append('organs', chosenOrgan);
  const url = 'https://my-api.plantnet.org/v2/identify/all'
    + `?api-key=${encodeURIComponent(apiKey)}&nb-results=5&lang=en`;
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

app.get('/', (req, res) => res.redirect('/identify'));

app.get('/identify', (req, res) => res.render('pages/identify'));

app.post('/identify', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) return res.render('pages/identify', { message: uploadErr.message, error: true });
    if (!req.file) return res.render('pages/identify', { message: 'Choose a JPG or PNG photo first.', error: true });
    try {
      const result = await identifyWithPlantNet(req.file, req.body.organ);
      res.render('pages/identify', {
        ...result,
        remaining: result.remainingIdentificationRequests,
      });
    } catch (err) {
      res.render('pages/identify', { message: err.message, error: true });
    }
  });
});

// JSON version, for Postman and for the teammate's frontend/DB code.
// Request: multipart form-data, field "image" (File), optional "organ" (Text).
// Response: the parsed result (see parsePlantNetResponse), NOT Pl@ntNet's
// raw nested JSON, or { error } with the right status.
app.post('/api/identify', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded. Send multipart field "image" as a File.' });
    try {
      const result = await identifyWithPlantNet(req.file, req.body.organ);
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, details: err.details || undefined });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Bloom API-only slice running at http://localhost:${PORT}`);
});
