// ----------------------------------   DEPENDENCIES   ----------------------------------------------
const express = require('express');
const handlebars = require('express-handlebars');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const crypto = require('crypto');
const validateRegistration = require('./validateRegistration');
const { sendMail } = require('./mailer');
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
  // Optional recovery email, stored lowercase so it matches however it's typed later
  const email = (req.body.email || '').trim().toLowerCase();

  if (!validateRegistration({ username, password, email })) {
    let message;
    if (!username || !password) {
      message = 'Username and password are required.';
    } else if (email && !validateRegistration.isValidEmail(email)) {
      message = 'Enter a valid recovery email, or leave it blank.';
    } else {
      message = 'Username must be at most 50 characters and password 8–72 characters.';
    }
    return res.status(400).render('pages/register', {
      username,
      email,
      error: true,
      message,
    });
  }


  try {
    const hash = await bcrypt.hash(password, 10);
    await db.none('INSERT INTO users (username, password, email) VALUES ($1, $2, $3)', [
      username,
      hash,
      email || null,
    ]);
    res.redirect('/login');
  } catch (err) {
    // 23505 = the username already exists
    if (err.code === '23505') {
      return res.status(400).render('pages/register', {
        username,
        email,
        error: true,
        message: 'That username is already taken.',
      });
    }
    console.error(err);
    res.status(500).render('pages/register', {
      username,
      email,
      error: true,
      message: 'Something went wrong. Please try again.',
    });
  }
});

app.get('/login', (req, res) => {
  // A finished password reset lands on /login?reset=1
  const message = req.query.reset ? 'Your password has been reset. Log in with your new password.' : undefined;
  res.render('pages/login', { message });
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

// -------------------------------------   PASSWORD RESET ROUTES   ----------------------------------------------
// Reset links in emails start with this; set APP_URL in .env if the app runs somewhere else
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const RESET_LINK_INVALID = 'That reset link is invalid or has expired. Request a new one below.';

// Only a hash of each reset token is saved, so someone who sees the database still can't use the links
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

app.get('/forgot-password', (req, res) => {
  res.render('pages/forgot-password');
});

app.post('/forgot-password', async (req, res) => {
  const account = typeof req.body.account === 'string' ? req.body.account.trim() : '';

  if (!account) {
    return res.status(400).render('pages/forgot-password', {
      error: true,
      message: 'Enter your username or recovery email.',
    });
  }

  try {
    const users = await db.any(
      `SELECT user_id, username, email
       FROM users
       WHERE email IS NOT NULL AND (username = $1 OR email = LOWER($1))`,
      [account]
    );

    for (const user of users) {
      const token = crypto.randomBytes(32).toString('hex');

      // A new request replaces the user's older link (and expired links are cleared out)
      await db.tx(async t => {
        await t.none('DELETE FROM password_resets WHERE user_id = $1 OR expires_at < NOW()', [user.user_id]);
        await t.none(
          `INSERT INTO password_resets (token_hash, user_id, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
          [hashToken(token), user.user_id]
        );
      });

      // Not awaited, so the page responds the same way whether or not an email goes out
      sendMail({
        to: user.email,
        subject: 'Reset your Bloom password',
        text: [
          `Hi ${user.username},`,
          '',
          'Someone asked to reset the password for your Bloom account. To choose a new password, open this link within 1 hour:',
          '',
          `${APP_URL}/reset-password?token=${token}`,
          '',
          "If this wasn't you, you can ignore this email. Your password won't change.",
        ].join('\n'),
      }).catch(err => console.error('Could not send reset email:', err));
    }

    // Same message whether or not the account exists, so this page can't be used to find accounts
    res.render('pages/forgot-password', {
      message: 'If that account has a recovery email, a reset link is on its way. The link works for 1 hour.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/forgot-password', {
      account,
      error: true,
      message: 'Something went wrong. Please try again.',
    });
  }
});

app.get('/reset-password', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';

  try {
    const reset = await db.oneOrNone(
      'SELECT 1 FROM password_resets WHERE token_hash = $1 AND expires_at > NOW()',
      [hashToken(token)]
    );
    if (!reset) {
      return res.status(400).render('pages/forgot-password', { error: true, message: RESET_LINK_INVALID });
    }

    res.render('pages/reset-password', { token });
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/forgot-password', {
      error: true,
      message: 'Something went wrong. Please try again.',
    });
  }
});

app.post('/reset-password', async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const password = req.body.password || '';
  const confirmPassword = req.body.confirm_password || '';

  let message;
  if (!validateRegistration.isValidPassword(password)) {
    message = 'Password must be 8–72 characters.';
  } else if (password !== confirmPassword) {
    message = 'The passwords do not match.';
  }
  if (message) {
    return res.status(400).render('pages/reset-password', { token, error: true, message });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    const changed = await db.tx(async t => {
      // Deleting the link as it's used means it only works once
      const reset = await t.oneOrNone(
        `DELETE FROM password_resets
         WHERE token_hash = $1 AND expires_at > NOW()
         RETURNING user_id`,
        [hashToken(token)]
      );
      if (!reset) {
        return false;
      }
      await t.none('UPDATE users SET password = $1 WHERE user_id = $2', [hash, reset.user_id]);
      return true;
    });

    if (!changed) {
      return res.status(400).render('pages/forgot-password', { error: true, message: RESET_LINK_INVALID });
    }

    res.redirect('/login?reset=1');
  } catch (err) {
    console.error(err);
    res.status(500).render('pages/reset-password', {
      token,
      error: true,
      message: 'Something went wrong. Please try again.',
    });
  }
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

app.get('/settings', (req, res) => {
  res.render('pages/settings', { user: req.session.user });
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
