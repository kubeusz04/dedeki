const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dedeki-dnd-vtt-secret-key-change-in-production-' + require('crypto').randomBytes(16).toString('hex');
const JWT_EXPIRY = '24h';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Brak tokenu autoryzacji' });
  }
  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token' });
  }
  req.user = decoded;
  next();
}

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Brak autoryzacji'));
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Nieprawidłowy token'));
  }
  socket.user = decoded;
  next();
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  authMiddleware,
  socketAuthMiddleware
};
