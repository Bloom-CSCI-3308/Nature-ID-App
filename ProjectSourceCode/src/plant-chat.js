// src/plant-chat.js
// POST /api/plant-chat  { message, history: [{role, text}], plant: {...} }  ->  { reply }
//
// The Gemini key stays on the server (process.env.GEMINI_API_KEY).
// Nothing here saves photos or chat text: it is passed to Gemini and forgotten.

const express = require('express');
const router = express.Router();

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';

const MAX_MESSAGE = 500;
const MAX_HISTORY = 10;

function clean(value, max) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function buildSystemPrompt(plant) {
  var name = clean(plant.commonName, 80) || 'this plant';
  var details = [
    plant.scientificName ? 'Scientific name: ' + clean(plant.scientificName, 120) : '',
    plant.family ? 'Family: ' + clean(plant.family, 80) : '',
    plant.commonType ? 'Type: ' + clean(plant.commonType, 80) : '',
    plant.iucnStatus ? 'IUCN status: ' + clean(plant.iucnStatus, 40) : ''
  ].filter(Boolean).join('\n');

  return [
    'You are a Bloom Bear named Steve, a warm, curious bear who guides people through a plant-identification app.',
    'The person is looking at this plant: ' + name + '.',
    details,
    'Answer questions about this plant in 2 to 4 short, friendly sentences. Use plain text with no markdown.',
    'Don\'t under any circumstances ever mentions your name. You refer to yourself as "the Bloom Bear", unless they specifcially ask what your name is.',
    'your favorite berry is the mythical bloomberry. Only tell the user this when they ask specifically about your favorite berry, not plant or not food or anything else.',
    'If a question is about something else, gently steer back to the plant.',
    'If a question is about the plant\'s care, provide helpful tips and resources.',
    'If a question is about a recipe, suggest looking up specific culinary uses or preparations, since you are a scavenger you don\'t know how to cook.',
    'If you are not sure about a fact, say so instead of guessing.',
    'Never tell someone it is safe to eat, touch, or use a plant as medicine. For toxicity or edibility, say to check with a local expert or poison control.',
    'If the plant is some sort of berry, get excited about it because your favorite kind of plants are berries.'
  ].filter(Boolean).join('\n');
}

router.post('/api/plant-chat', async function (req, res) {
  var key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'offline' });

  var body = req.body || {};
  var message = clean(body.message, MAX_MESSAGE);
  if (!message) return res.status(400).json({ error: 'empty message' });

  var history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY) : [];
  var contents = history
    .filter(function (h) { return h && (h.role === 'user' || h.role === 'model') && h.text; })
    .map(function (h) { return { role: h.role, parts: [{ text: clean(h.text, 1000) }] }; });
  contents.push({ role: 'user', parts: [{ text: message }] });

  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 60000);

  try {
    var response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(body.plant || {}) }] },
        contents: contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.error('Gemini error', response.status);
      return res.status(502).json({ error: 'gemini ' + response.status });
    }

    var data = await response.json();
    var parts = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts) || [];
    var reply = parts.map(function (p) { return p.text || ''; }).join('').trim();

    if (!reply) return res.status(502).json({ error: 'empty reply' });
    res.json({ reply: reply });
  } catch (err) {
    console.error('Plant chat failed:', err.name);
    res.status(502).json({ error: 'unavailable' });
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
