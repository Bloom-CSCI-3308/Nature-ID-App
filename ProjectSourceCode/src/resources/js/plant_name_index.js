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

// Shared core: one photo buffer -> Pl@ntNet response JSON.
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
  return data;
}

app.get('/', (req, res) => res.redirect('/identify'));

app.get('/identify', (req, res) => res.render('pages/identify'));

app.post('/identify', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) return res.render('pages/identify', { message: uploadErr.message, error: true });
    if (!req.file) return res.render('pages/identify', { message: 'Choose a JPG or PNG photo first.', error: true });
    try {
      const data = await identifyWithPlantNet(req.file, req.body.organ);
      res.render('pages/identify', {
        bestMatch: data.bestMatch,
        results: data.results || [],
        predictedOrgans: data.predictedOrgans || [],
        remaining: data.remainingIdentificationRequests,
      });
    } catch (err) {
      res.render('pages/identify', { message: err.message, error: true });
    }
  });
});

// JSON version, for Postman and for the teammate's frontend/DB code.
// Request: multipart form-data, field "image" (File), optional "organ" (Text).
// Response: Pl@ntNet's JSON verbatim (bestMatch, results, predictedOrgans,
// remainingIdentificationRequests, ...), or { error } with the right status.
app.post('/api/identify', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded. Send multipart field "image" as a File.' });
    try {
      const data = await identifyWithPlantNet(req.file, req.body.organ);
      res.json(data);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, details: err.details || undefined });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Bloom API-only slice running at http://localhost:${PORT}`);
});
