// something@something.something, with no spaces
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The recovery email is optional, but if one is given it must look like an email
function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email);
}

// bcrypt only uses the first 72 characters, so longer passwords aren't allowed
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 72;
}

function validateRegistration({ username, password, email }) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return false;
  }

  const trimmedUsername = username.trim();

  if (!trimmedUsername || !password) {
    return false;
  }
  if (trimmedUsername.length > 50) {
    return false;
  }
  if (!isValidPassword(password)) {
    return false;
  }
  if (email && !isValidEmail(email)) {
    return false;
  }

  return true;
}

module.exports = validateRegistration;
module.exports.isValidEmail = isValidEmail;
module.exports.isValidPassword = isValidPassword;
