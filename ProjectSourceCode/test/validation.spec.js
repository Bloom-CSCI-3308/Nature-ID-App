const { expect } = require('chai');
const validateRegistration = require('../src/validateRegistration');

describe('validateRegistration', () => {
  it('returns false when the password is missing', () => {
    expect(validateRegistration({ username: 'nicholas' })).to.equal(false);
  });

  it('returns false when the username is missing', () => {
    expect(validateRegistration({ password: 'TestPassword123!' })).to.equal(false);
  });

  it('returns false when the password is shorter than 8 characters', () => {
    expect(
      validateRegistration({ username: 'nicholas', password: 'short' })
    ).to.equal(false);
  });

  it('returns false when the username is longer than 50 characters', () => {
    expect(
      validateRegistration({ username: 'a'.repeat(51), password: 'TestPassword123!' })
    ).to.equal(false);
  });

  it('returns true for a valid username and password', () => {
    expect(
      validateRegistration({ username: 'nicholas', password: 'TestPassword123!' })
    ).to.equal(true);
  });
});
