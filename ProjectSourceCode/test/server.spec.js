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
