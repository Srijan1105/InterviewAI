const jwt = require('jsonwebtoken');

function verifyToken(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new Error('Unauthorized');
  return jwt.verify(token, process.env.JWT_SECRET);
}

function signToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { verifyToken, signToken };
