const chai = require('chai');
const chaiHttp = require('chai-http');
const { randomUUID } = require('crypto');
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
});
