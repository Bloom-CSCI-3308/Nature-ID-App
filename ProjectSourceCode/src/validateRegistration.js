function validateRegistration({ username, password }) {
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
  if (password.length < 8 || password.length > 72) {
    return false;
  }

  return true;
}

module.exports = validateRegistration;
