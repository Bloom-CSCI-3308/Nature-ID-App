const chai = require('chai');
const chaiHttp = require('chai-http');
const { randomUUID, createHash } = require('crypto');
const bcrypt = require('bcryptjs');
const app = require('../src/index');
const { db, pgp } = require('../src/db');

chai.use(chaiHttp);

const { expect } = chai;

// Root hook: close the shared database pool after all tests in this process.
after(() => {
  pgp.end();
});

describe('Welcome route', () => {
  it('returns the default welcome message', async () => {
    const res = await chai.request(app).get('/welcome');

    expect(res).to.have.status(200);
    expect(res.body).to.deep.equal({
      status: 'success',
      message: 'Welcome!',
    });
  });
});

describe('POST /register', () => {
  it('registers a new user and saves a hashed password', async () => {
    const username = `lab10_${randomUUID()}`;
    const password = 'TestPassword123!';

    const res = await chai
        .request(app)
        .post('/register')
        .redirects(0)
        .type('form')
        .send({ username, password });


    // Bloom redirects to /login on success.
    expect(res).to.have.status(302);
    expect(res).to.have.header('location', '/login');

    const user = await db.oneOrNone(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    expect(user).to.not.equal(null);
    expect(user.password).to.not.equal(password);
    expect(await bcrypt.compare(password, user.password)).to.equal(true);

    // Clean up only the user this test created.
    await db.none('DELETE FROM users WHERE username = $1', [username]);
  });

  it('rejects a registration with no password and saves nothing', async () => {
    const username = `lab10_${randomUUID()}`;

    const res = await chai
      .request(app)
      .post('/register')
      .type('form')
      .send({ username });

    expect(res).to.have.status(400);

    const user = await db.oneOrNone(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    expect(user).to.equal(null);
  });

  it('saves the recovery email in lowercase', async () => {
    const username = `lab10_${randomUUID()}`;

    const res = await chai
      .request(app)
      .post('/register')
      .redirects(0)
      .type('form')
      .send({ username, password: 'TestPassword123!', email: '  Justin@Example.com ' });

    expect(res).to.have.status(302);

    const user = await db.one('SELECT email FROM users WHERE username = $1', [username]);
    expect(user.email).to.equal('justin@example.com');

    await db.none('DELETE FROM users WHERE username = $1', [username]);
  });

  it('rejects an invalid recovery email and saves nothing', async () => {
    const username = `lab10_${randomUUID()}`;

    const res = await chai
      .request(app)
      .post('/register')
      .type('form')
      .send({ username, password: 'TestPassword123!', email: 'not-an-email' });

    expect(res).to.have.status(400);
    expect(res.text).to.include('Enter a valid recovery email');

    const user = await db.oneOrNone(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    expect(user).to.equal(null);
  });
});


describe('POST /login', () => {
  it('logs in with correct credentials and redirects to /home', async () => {
    const username = `lab10_${randomUUID()}`;
    const password = 'TestPassword123!';

    // Arrange: create the user through the real registration route.
    await chai
      .request(app)
      .post('/register')
      .redirects(0)
      .type('form')
      .send({ username, password });

    // Act: log in with the same credentials.
    const res = await chai
      .request(app)
      .post('/login')
      .redirects(0)
      .type('form')
      .send({ username, password });

    // Assert: redirect to /home, with a session cookie set.
    expect(res).to.have.status(302);
    expect(res).to.have.header('location', '/home');
    expect(res).to.have.header('set-cookie');

    await db.none('DELETE FROM users WHERE username = $1', [username]);
  });

  it('rejects a login with the wrong password', async () => {
    const username = `lab10_${randomUUID()}`;
    const password = 'TestPassword123!';

    await chai
      .request(app)
      .post('/register')
      .redirects(0)
      .type('form')
      .send({ username, password });

    const res = await chai
      .request(app)
      .post('/login')
      .redirects(0)
      .type('form')
      .send({ username, password: 'WrongPassword123!' });

    expect(res).to.have.status(400);
    expect(res.text).to.include('Incorrect username or password.');

    await db.none('DELETE FROM users WHERE username = $1', [username]);
  });
});

describe('Collection and rewards routes', () => {
  // A starter plant from insert.sql, so saving it never needs a Wikipedia lookup
  const scientificName = 'Aquilegia coerulea';
  const password = 'TestPassword123!';
  let agent;
  let username;
  let userId;

  // Arrange: register and log in a fresh user; the agent keeps the session cookie
  beforeEach(async () => {
    username = `lab10_${randomUUID()}`;
    agent = chai.request.agent(app);

    await agent.post('/register').redirects(0).type('form').send({ username, password });
    await agent.post('/login').redirects(0).type('form').send({ username, password });

    const user = await db.one('SELECT user_id FROM users WHERE username = $1', [username]);
    userId = user.user_id;
  });

  // Clean up only this test's user; ON DELETE CASCADE removes their plants and badges
  afterEach(async () => {
    agent.close();
    await db.none('DELETE FROM users WHERE username = $1', [username]);
  });

  it('redirects to /login when not logged in', async () => {
    const res = await chai.request(app).get('/rewards').redirects(0);

    expect(res).to.have.status(302);
    expect(res).to.have.header('location', '/login');
  });

  it('rejects saving a plant with no scientific name and saves nothing', async () => {
    const res = await agent.post('/collection').type('form').send({ common_name: 'Mystery plant' });

    expect(res).to.have.status(400);

    const finds = await db.one(
      'SELECT COUNT(*)::int AS count FROM users_to_plants WHERE user_id = $1',
      [userId]
    );
    expect(finds.count).to.equal(0);
  });

  it('saves a new plant, awards 10 points, and unlocks the First Find badge', async () => {
    const plant = await db.one('SELECT plant_id FROM plants WHERE scientific_name = $1', [
      scientificName,
    ]);

    const res = await agent
      .post('/collection')
      .redirects(0)
      .type('form')
      .send({ scientific_name: scientificName, common_name: 'Colorado Blue Columbine' });

    // Bloom redirects to the saved plant's detail page
    expect(res).to.have.status(302);
    expect(res).to.have.header('location', `/plants/${plant.plant_id}`);

    const user = await db.one('SELECT points FROM users WHERE user_id = $1', [userId]);
    expect(user.points).to.equal(10);

    const badge = await db.oneOrNone(
      `SELECT b.badge_name
       FROM users_to_badges ub
       JOIN badges b ON b.badge_id = ub.badge_id
       WHERE ub.user_id = $1 AND b.badge_name = 'First Find'`,
      [userId]
    );
    expect(badge).to.not.equal(null);
  });

  it('gives no extra points for a species the user already found', async () => {
    const form = { scientific_name: scientificName, common_name: 'Colorado Blue Columbine' };

    await agent.post('/collection').redirects(0).type('form').send(form);
    await agent.post('/collection').redirects(0).type('form').send(form);

    // Both sightings are saved, but points are only awarded once
    const finds = await db.one(
      'SELECT COUNT(*)::int AS count FROM users_to_plants WHERE user_id = $1',
      [userId]
    );
    expect(finds.count).to.equal(2);

    const user = await db.one('SELECT points FROM users WHERE user_id = $1', [userId]);
    expect(user.points).to.equal(10);
  });

  it('shows earned and locked badges on the rewards page', async () => {
    await agent
      .post('/collection')
      .redirects(0)
      .type('form')
      .send({ scientific_name: scientificName, common_name: 'Colorado Blue Columbine' });

    const res = await agent.get('/rewards');

    expect(res).to.have.status(200);
    expect(res.text).to.include('First Find');
    expect(res.text).to.include('earned');
    expect(res.text).to.include('Trail Scout');
    expect(res.text).to.include('locked');
  });

  it('shows a "Badge unlocked" message after earning a badge', async () => {
    const saveRes = await agent
      .post('/collection')
      .redirects(0)
      .type('form')
      .send({ scientific_name: scientificName, common_name: 'Colorado Blue Columbine' });

    // Follow the redirect to the plant page, where the message appears
    const pageRes = await agent.get(saveRes.headers.location);
    expect(pageRes).to.have.status(200);
    expect(pageRes.text).to.include('Badge unlocked: First Find!');

    // The message only shows once
    const againRes = await agent.get(saveRes.headers.location);
    expect(againRes.text).to.not.include('Badge unlocked');
  });
});

describe('Forgot password', () => {
  const password = 'TestPassword123!';
  const newPassword = 'NewPassword456!';
  let username;
  let userId;

  // Tests can't open the email, so the ones that need a reset link save one directly
  const saveResetLink = async (token, expiresIn = '1 hour') => {
    await db.none(
      `INSERT INTO password_resets (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + $3::interval)`,
      [createHash('sha256').update(token).digest('hex'), userId, expiresIn]
    );
  };

  // Arrange: a fresh user with a recovery email
  beforeEach(async () => {
    username = `lab10_${randomUUID()}`;
    await chai
      .request(app)
      .post('/register')
      .redirects(0)
      .type('form')
      .send({ username, password, email: `${username}@example.com` });

    const user = await db.one('SELECT user_id FROM users WHERE username = $1', [username]);
    userId = user.user_id;
  });

  // ON DELETE CASCADE also removes this user's reset links
  afterEach(async () => {
    await db.none('DELETE FROM users WHERE username = $1', [username]);
  });

  it('creates a reset link for an account with a recovery email', async () => {
    const res = await chai
      .request(app)
      .post('/forgot-password')
      .type('form')
      .send({ account: username });

    expect(res).to.have.status(200);
    expect(res.text).to.include('a reset link is on its way');

    const links = await db.any('SELECT * FROM password_resets WHERE user_id = $1', [userId]);
    expect(links).to.have.length(1);
  });

  it('shows the same message for an account that does not exist', async () => {
    const res = await chai
      .request(app)
      .post('/forgot-password')
      .type('form')
      .send({ account: `nobody_${randomUUID()}` });

    expect(res).to.have.status(200);
    expect(res.text).to.include('a reset link is on its way');
  });

  it('resets the password with a valid link, and the link only works once', async () => {
    const token = randomUUID();
    await saveResetLink(token);

    const res = await chai
      .request(app)
      .post('/reset-password')
      .redirects(0)
      .type('form')
      .send({ token, password: newPassword, confirm_password: newPassword });

    expect(res).to.have.status(302);
    expect(res).to.have.header('location', '/login?reset=1');

    const login = await chai
      .request(app)
      .post('/login')
      .redirects(0)
      .type('form')
      .send({ username, password: newPassword });
    expect(login).to.have.header('location', '/home');

    const reuse = await chai
      .request(app)
      .post('/reset-password')
      .type('form')
      .send({ token, password: 'AnotherPassword789!', confirm_password: 'AnotherPassword789!' });
    expect(reuse).to.have.status(400);
    expect(reuse.text).to.include('invalid or has expired');
  });

  it('rejects an expired link and keeps the old password', async () => {
    const token = randomUUID();
    await saveResetLink(token, '-1 minute');

    const res = await chai
      .request(app)
      .post('/reset-password')
      .type('form')
      .send({ token, password: newPassword, confirm_password: newPassword });

    expect(res).to.have.status(400);
    expect(res.text).to.include('invalid or has expired');

    const user = await db.one('SELECT password FROM users WHERE user_id = $1', [userId]);
    expect(await bcrypt.compare(password, user.password)).to.equal(true);
  });

  it('rejects passwords that do not match and keeps the link usable', async () => {
    const token = randomUUID();
    await saveResetLink(token);

    const res = await chai
      .request(app)
      .post('/reset-password')
      .type('form')
      .send({ token, password: newPassword, confirm_password: 'Different123!' });

    expect(res).to.have.status(400);
    expect(res.text).to.include('The passwords do not match.');

    const page = await chai.request(app).get(`/reset-password?token=${token}`);
    expect(page).to.have.status(200);
  });
});
