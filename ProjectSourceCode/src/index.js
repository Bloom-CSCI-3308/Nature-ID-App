// ----------------------------------   DEPENDENCIES   ----------------------------------------------
const express = require('express');
const handlebars = require('express-handlebars');
const bcrypt = require('bcryptjs');
const pgp = require('pg-promise')();
const path = require('path');

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

// -------------------------------------   DB CONFIG   ----------------------------------------------
const db = pgp({
  host: process.env.POSTGRES_HOST || 'db',
  port: 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

// -------------------------------------   PUBLIC ROUTES   ----------------------------------------------
app.get('/register', (req, res) => {
  res.render('pages/register');
});

app.post('/register', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (!username || !password) {
    return res.status(400).render('pages/register', {
      username,
      error: true,
      message: 'Username and password are required.',
    });
  }
  if (username.length > 50 || password.length < 8 || password.length > 72) {
    return res.status(400).render('pages/register', {
      username,
      error: true,
      message: 'Username must be at most 50 characters and password 8–72 characters.',
    });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await db.none('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
    res.redirect('/login');
  } catch (err) {
    // 23505 = unique_violation, i.e. the username already exists
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
