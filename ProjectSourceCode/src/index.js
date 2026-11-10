// ----------------------------------   DEPENDENCIES   ----------------------------------------------
const express = require('express');
const handlebars = require('express-handlebars');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const validateRegistration = require('./validateRegistration');
const { db } = require('./db');
const path = require('path');
require('dotenv').config();
const { getOrCreatePlant, getPlantDescription } = require('./plantHelpers');
const { upload, identifyWithPlantNet } = require('./identify');
const app = express();





// -------------------------------------   APP CONFIG   ----------------------------------------------
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
});

app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/resources', express.static(path.join(__dirname, 'resources')));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

// -------------------------------------   DB CONFIG   ----------------------------------------------
// Database connection is in src/db.js — imported above, so routes and tests share it. (FOR LAB 10)

// -------------------------------------   PUBLIC ROUTES   ----------------------------------------------
app.get('/register', (req, res) => {
  res.render('pages/register');
});

app.post('/register', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (!validateRegistration({ username, password })) {
  const message =
    !username || !password
      ? 'Username and password are required.'
      : 'Username must be at most 50 characters and password 8–72 characters.';
  return res.status(400).render('pages/register', {
    username,
    error: true,
    message,
  });
}


  try {
    const hash = await bcrypt.hash(password, 10);
    await db.none('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
    res.redirect('/login');
  } catch (err) {
    // 23505 = the username already exists
    if (err.code === '23505') {
      return res.status(400).render('pages/register', {
        username,
        error: true,
        message: 'That username is already taken.',
      });
    }
    console.error(err);
    res.status(500).render('pages/register', {
      username,
      error: true,
      message: 'Something went wrong. Please try again.',
    });
  }
});

app.get('/login', (req, res) => {
  res.render('pages/login');
});

app.post('/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (!username || !password) {
    return res.status(400).render('pages/login', {
      username,
      error: true,
      message: 'Username and password are required.',
    });
  }

  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
    // Same message for unknown username and wrong password so usernames can't be guessed
    const match = user && (await bcrypt.compare(password, user.password));
    if (!match) {
      return res.status(400).render('pages/login', {
        username,
        error: true,
        message: 'Incorrect username or password.',
      });
    }

    req.session.user = { user_id: user.user_id, username: user.username };
    // "Remember me" keeps the user logged in for 30 days; otherwise the login ends when the browser closes
    if (req.body.remember) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    }
    req.session.save(() => res.redirect('/home'));
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/login', {
      username,
      error: true,
      message: 'Something went wrong. Please try again.',
    });
  }
});

app.get('/welcome', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Welcome!' });
});

// -------------------------------------   AUTH MIDDLEWARE   ----------------------------------------------
// Every route registered below this requires a logged-in user
const auth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

app.use(auth);

// -------------------------------------   PROTECTED ROUTES   ----------------------------------------------
app.get('/home', (req, res) => {
  res.render('pages/home', { user: req.session.user });
});

// -------------------------------------   IDENTIFY ROUTES   ----------------------------------------------
app.get('/identify', (req, res) => {
  res.render('pages/identify', { user: req.session.user });
});

app.post('/identify', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.render('pages/identify', {
        user: req.session.user, error: true, message: uploadErr.message,
      });
    }
    if (!req.file) {
      return res.render('pages/identify', {
        user: req.session.user, error: true,
        message: 'Choose a JPG or PNG photo first.',
      });
    }
    try {
      const result = await identifyWithPlantNet(req.file, req.body.organ);
      const description = result.scientificName
        ? await getPlantDescription(result.scientificName)
        : 'No description available yet.';
      res.render('pages/identify', {
        user: req.session.user,
        ...result,
        description,
        imagePath: `/resources/uploads/${req.file.filename}`,
        location: (req.body.location || '').trim(),
      });
    } catch (err) {
      console.error(err);
      res.render('pages/identify', {
        user: req.session.user, error: true, message: err.message,
      });
    }
  });
});

app.post('/api/identify', (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Send multipart field "image" as a File.' });
    }
    try {
      const result = await identifyWithPlantNet(req.file, req.body.organ);
      res.json({ ...result, imagePath: `/resources/uploads/${req.file.filename}` });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, details: err.details || undefined });
    }
  });
});


app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});


// -------------------------------------   COLLECTION ROUTES   ----------------------------------------------

app.get('/collection', async (req, res) => {
  const userId = req.session.user.user_id;

  try {
    const plants = await db.any(
      `SELECT p.plant_id AS id,
       p.common_name AS "commonName",
       p.scientific_name AS "scientificName",
       COUNT(*)::int AS "timesFound",
       MAX(up.image_path) AS image,
       MAX(up.found_at) AS "lastFound"
       FROM users_to_plants up
       JOIN plants p ON p.plant_id = up.plant_id
       WHERE up.user_id = $1
       GROUP BY p.plant_id, p.common_name, p.scientific_name
       ORDER BY MAX(up.found_at) DESC`,
      [userId]
    );

    res.render('pages/collection', {
  plants,
  user: req.session.user,
  totalSpecies: plants.length,
  totalFinds: plants.reduce((sum, p) => sum + p.timesFound, 0),
});

  } catch (err) {
    console.error(err);
    res.status(500).render('pages/collection', {
      plants: [],
      user: req.session.user,
      error: true,
      message: 'Could not load your collection. Please try again.',
    });
  }
});

// Show one plant the logged-in user has found
app.get('/plants/:id', async (req, res) => {
  const userId = req.session.user.user_id;
  const plantId = parseInt(req.params.id, 10);

  // /plants/abc or /plants/-1 → back to the collection
  if (!Number.isInteger(plantId) || plantId < 1) {
    return res.redirect('/collection');
  }

  try {
    const plant = await db.oneOrNone(
      `SELECT p.plant_id AS id,
              p.common_name AS "commonName",
              p.scientific_name AS "scientificName",
              p.plant_description AS description,
              up.image_path AS image,
              up.location,
              TO_CHAR(up.found_at, 'Mon DD, YYYY') AS "dateFound"
       FROM users_to_plants up
       JOIN plants p ON p.plant_id = up.plant_id
       WHERE up.user_id = $1 AND up.plant_id = $2
       ORDER BY up.found_at ASC
       LIMIT 1`,
      [userId, plantId]
    );

    // Not in this user's collection (or doesn't exist)
    if (!plant) {
      return res.redirect('/collection');
    }

    res.render('pages/plant-detail', { plant, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.redirect('/collection');
  }
});

const POINTS_PER_NEW_PLANT = 10;

// Save an identified plant to the logged-in user's collection,
// award points for new species, and unlock any badges they now qualify for
app.post('/collection', async (req, res) => {
  const userId = req.session.user.user_id;
  const scientificName = (req.body.scientific_name || '').trim();
  const commonName = (req.body.common_name || '').trim();
  const imagePath = req.body.image_path || null;
  const location = (req.body.location || '').trim() || null;

  if (!scientificName) {
    return res.status(400).render('pages/home', {
      user: req.session.user,
      error: true,
      message: 'No plant to save. Please identify a plant first.',
    });
  }

  try {
    // Find the plant in our database, or add it with a Wikipedia description.
    // Done before the transaction so the Wikipedia request doesn't hold it open.
    const plantId = await getOrCreatePlant(db, scientificName, commonName);

    await db.tx(async t => {
      // Has this user found this species before?
      const alreadyFound = await t.oneOrNone(
        'SELECT 1 FROM users_to_plants WHERE user_id = $1 AND plant_id = $2 LIMIT 1',
        [userId, plantId]
      );

      await t.none(
        `INSERT INTO users_to_plants (user_id, plant_id, image_path, location)
         VALUES ($1, $2, $3, $4)`,
        [userId, plantId, imagePath, location]
      );

      // Points only for a species that's new to this user
      if (!alreadyFound) {
        await t.none('UPDATE users SET points = points + $1 WHERE user_id = $2', [
          POINTS_PER_NEW_PLANT,
          userId,
        ]);
      }

      // Award every badge the user now qualifies for (already-earned ones are skipped)
      await t.none(
        `INSERT INTO users_to_badges (user_id, badge_id)
         SELECT $1, b.badge_id
         FROM badges b
         WHERE b.badge_requirements <= (
           SELECT COUNT(DISTINCT plant_id) FROM users_to_plants WHERE user_id = $1
         )
         ON CONFLICT (user_id, badge_id) DO NOTHING`,
        [userId]
      );
    });

    res.redirect(`/plants/${plantId}`);
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/home', {
      user: req.session.user,
      error: true,
      message: 'Could not save this plant. Please try again.',
    });
  }
});

// Show the user's points, plant count, and every badge (earned or locked)
app.get('/rewards', async (req, res) => {
  const userId = req.session.user.user_id;

  try {
    const stats = await db.one(
      `SELECT u.points,
              (SELECT COUNT(DISTINCT plant_id)
               FROM users_to_plants
               WHERE user_id = u.user_id)::int AS "plantCount"
       FROM users u
       WHERE u.user_id = $1`,
      [userId]
    );

    const badges = await db.any(
      `SELECT b.badge_id AS id,
              b.badge_name AS name,
              b.badge_description AS description,
              b.badge_requirements AS "plantsRequired",
              ub.user_id IS NOT NULL AS earned,
              TO_CHAR(ub.obtained_at, 'Mon DD, YYYY') AS "dateEarned"
       FROM badges b
       LEFT JOIN users_to_badges ub
         ON ub.badge_id = b.badge_id AND ub.user_id = $1
       ORDER BY b.badge_requirements ASC`,
      [userId]
    );

    // The first badge not earned yet is the next goal
    const nextBadge = badges.find(b => !b.earned) || null;

    res.render('pages/rewards', {
      user: req.session.user,
      points: stats.points,
      plantCount: stats.plantCount,
      badges,
      nextBadge,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/rewards', {
      user: req.session.user,
      badges: [],
      error: true,
      message: 'Could not load your rewards. Please try again.',
    });
  }
});

// -------------------------------------   START SERVER   ----------------------------------------------
// Only listen when run directly (npm start); tests import the app without starting a server
if (require.main === module) {
  db.connect()
    .then(obj => {
      console.log('Database connection successful');
      obj.done();
    })
    .catch(err => console.error('Database connection error:', err.message || err));

  app.listen(3000, () => console.log('Server is listening on port 3000'));
}

module.exports = app;
