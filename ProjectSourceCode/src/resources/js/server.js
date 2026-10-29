require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Keep the upload in memory only — we forward the buffer and never save a file.
// 10 MB cap for messing around (Pl@ntNet's own cap is 50 MB total per request).
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

app.use(express.static(path.join(__dirname, 'public')));

// POST /api/identify — frontend sends multipart field "image" (one photo).
app.post('/api/identify', upload.single('image'), async (req, res) => {
  const apiKey = process.env.PLANTNET_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'PLANTNET_API_KEY is not set. Copy .env.example to .env and add your key, then restart.',
    });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded. Choose a JPG or PNG first.' });
  }

  try {
    // Build the exact multipart body Pl@ntNet expects.
    const form = new FormData();
    form.append(
      'images',
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname
    );
    form.append('organs', 'auto');

    const url =
      'https://my-api.plantnet.org/v2/identify/all' +
      `?api-key=${encodeURIComponent(apiKey)}&nb-results=5&lang=en`;

    const plantnetRes = await fetch(url, { method: 'POST', body: form });

    const data = await plantnetRes.json().catch(() => ({}));
    if (!plantnetRes.ok) {
      // Forward Pl@ntNet's error, but never the key.
      return res.status(plantnetRes.status).json({
        error: data.message || data.error || 'Pl@ntNet rejected the request.',
        details: data,
      });
    }

    // Full response: bestMatch, results[] (score 0-1, descending),
    // predictedOrgans, remainingIdentificationRequests, etc.
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to reach Pl@ntNet.', details: err.message });
  }
});

// Multer / file-filter errors should come back as JSON, not an HTML crash page.
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

app.listen(PORT, () => {
  console.log(`PlantNet prototype running at http://localhost:${PORT}`);
});
