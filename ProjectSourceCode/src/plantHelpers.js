// src/plantHelpers.js — REPLACE the local version with this file.
// Only getPlantDescription() changed. getOrCreatePlant() is unchanged.
//
// Why the fix: Pl@ntNet returns the scientific name WITH the author,
// e.g. "Festuca glauca Vill." — but the Wikipedia page is just
// "Festuca glauca". Looking up the full name 404s, so you got
// "No description available yet." This version tries, in order:
//   1. the full name as given
//   2. genus + species only (first two words) — "Festuca glauca"
//   3. the common name, if one was passed in
// and returns the first real article it finds.
//
// Note: if you already saved this plant, its row in the plants table
// already has "No description available yet." stored, and
// getOrCreatePlant() returns the existing row without re-fetching.
// To re-test the description for that species, delete that row first:
//   DELETE FROM plants WHERE scientific_name = 'Festuca glauca Vill.';
// or test with a plant you haven't saved yet.

const axios = require('axios');

function firstSentences(text, count = 2) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!sentences) {
    return text;
  }
  return sentences.slice(0, count).join('').trim();
}

async function fetchWikipediaSummary(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const response = await axios.get(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
    {
      headers: {
        'User-Agent': 'Bloom-CSCI3308 (https://github.com/Bloom-CSCI-3308/Nature-ID-App)',
      },
      timeout: 5000,
    }
  );
  // Only use real articles, not "may refer to" disambiguation pages
  if (response.data.type !== 'standard') {
    return null;
  }
  return firstSentences(response.data.extract || '', 2) || null;
}

// Get a short description of a plant from Wikipedia.
// Returns a default message if Wikipedia has no page for it.
async function getPlantDescription(scientificName, commonName) {
  const words = (scientificName || '').trim().split(/\s+/);
  const titles = [];
  if (scientificName) titles.push(scientificName.trim());
  // Genus + species only — drops the author, e.g. "Festuca glauca Vill." -> "Festuca glauca"
  if (words.length > 2) titles.push(words.slice(0, 2).join(' '));
  if (commonName) titles.push(commonName.trim());

  for (const title of titles) {
    try {
      const description = await fetchWikipediaSummary(title);
      if (description) return description;
    } catch (err) {
      console.log(`No Wikipedia description for ${title}:`, err.message);
    }
  }
  return 'No description available yet.';
}

// Find a plant in the database by scientific name, or add it if it's new.
// Returns the plant's plant_id.
async function getOrCreatePlant(db, scientificName, commonName) {
  // Already in the database? Use it (no Wikipedia call needed).
  const existing = await db.oneOrNone(
    'SELECT plant_id FROM plants WHERE scientific_name = $1',
    [scientificName]
  );
  if (existing) {
    return existing.plant_id;
  }

  // New plant: get a description, then save it.
  const description = await getPlantDescription(scientificName, commonName);
  const inserted = await db.oneOrNone(
    `INSERT INTO plants (common_name, scientific_name, plant_description)
     VALUES ($1, $2, $3)
     ON CONFLICT (scientific_name) DO NOTHING
     RETURNING plant_id`,
    [commonName || scientificName, scientificName, description]
  );

  // If two users saved the same new plant at the same time, the insert
  // is skipped, so look it up again.
  if (inserted) {
    return inserted.plant_id;
  }
  const plant = await db.one(
    'SELECT plant_id FROM plants WHERE scientific_name = $1',
    [scientificName]
  );
  return plant.plant_id;
}

module.exports = { getPlantDescription, getOrCreatePlant };
