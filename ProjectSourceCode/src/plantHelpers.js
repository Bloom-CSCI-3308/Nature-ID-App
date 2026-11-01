const axios = require('axios');

function firstSentences(text, count = 2) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!sentences) {
    return text;
  }
  return sentences.slice(0, count).join('').trim();
}
// Get a short description of a plant from Wikipedia.
// Returns a default message if Wikipedia has no page for it.
async function getPlantDescription(scientificName) {
  try {
    const title = encodeURIComponent(scientificName.replace(/ /g, '_'));
    const response = await axios.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
      {
        headers: {
          'User-Agent': 'Bloom-CSCI3308 (https://github.com/Bloom-CSCI-3308/Nature-ID-App)',
        },
        timeout: 5000,
      }
    );

    // Only use real articles, not "may refer to" disambiguation pages
    if (response.data.type !== 'standard') {
      return 'No description available yet.';
    }
    return firstSentences(response.data.extract || '', 2) || 'No description available yet.';  // ← changed
  } catch (err) {
    console.log(`No Wikipedia description for ${scientificName}:`, err.message);
    return 'No description available yet.';
  }
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
  const description = await getPlantDescription(scientificName);
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