const jwt = require('jsonwebtoken')
const helpers = require('../_helpers')

const adminController = {
  signIn: (req, res, next) => {
    try {
      const userData = helpers.getUser(req).toJSON()
      const authToken = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '30d' })

      res.json({
        status: 'success',
        authToken,
        data: {
          user: userData
        }
      })
    } catch (err) {
      next(err)
    }
  }
}

module.exports = adminController
