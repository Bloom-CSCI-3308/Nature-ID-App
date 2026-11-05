// ----------------------------------   DEPENDENCIES   ----------------------------------------------
const express = require('express');
const handlebars = require('express-handlebars');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { db } = require('./db');
const path = require('path');
const validateRegistration = require('./validateRegistration');

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

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
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
