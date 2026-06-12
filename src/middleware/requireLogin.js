// ============================================================================
//  requireLogin — a tiny "gatekeeper" for routes that need a logged-in user
// ----------------------------------------------------------------------------
//  In Express, "middleware" is just a function that runs BEFORE a route handler.
//  It gets (req, res, next):
//    - if everything is fine, it calls next() to continue to the route
//    - if not, it sends a response and does NOT call next(), stopping here.
//
//  When a user logs in (see routes/auth.js) we save their id on req.session.
//  So "is the user logged in?" is simply "does req.session.userId exist?".
//
//  Usage:  router.post('/', requireLogin, (req, res) => { ... })
// ============================================================================

module.exports = function requireLogin(req, res, next) {
  if (!req.session.userId) {
    // 401 Unauthorized = "you need to be logged in to do this".
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next(); // logged in — carry on to the actual route handler
};
