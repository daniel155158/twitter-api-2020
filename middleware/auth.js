const passport = require('../config/passport')

const authenticated = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err || !user) {
      return res.status(401).json({
        status: 'error',
        message: 'unauthorized'
      })
    } else if (user && user.account === 'root') {
      return res.status(403).json({
        status: 'error',
        message: 'forbidden'
      })
    }

    req.user = user
    next()
  })(req, res, next)
}

const authenticatedAdmin = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err || !user) {
      return res.status(401).json({
        status: 'error',
        message: 'unauthorized'
      })
    } else if (user && user.dataValues.name !== 'root') {
      return res.status(403).json({
        status: 'error',
        message: 'forbidden'
      })
    }

    req.user = user
    next()
  })(req, res, next)
}

module.exports = {
  authenticated,
  authenticatedAdmin
}
