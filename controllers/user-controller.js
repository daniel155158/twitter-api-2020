const sequelize = require('sequelize')
const bcrypt = require('bcryptjs')
const db = require('../models')
const { User, Followship, Tweet, Reply, Like } = db
const jwt = require('jsonwebtoken')
const helpers = require('../_helpers')
const { imgurFileHandler } = require('../helpers/file-helpers')
const dayjs = require('dayjs')
const relativeTime = require('dayjs/plugin/relativeTime')
dayjs.extend(relativeTime)
require('dayjs/locale/zh-tw')
dayjs.locale('zh-tw')

const userController = {
  signUp: (req, res, next) => {
    const { account, name, email, password, checkPassword } = req.body

    if (password !== checkPassword) throw new Error('Password do not match!')
    if (name.length > 50) throw new Error("name can't over 50 letters")

    return Promise.all([
      User.findOne({ where: { account } }),
      User.findOne({ where: { email } })
    ])
      .then(([repeatAccount, repeatEmail]) => {
        if (repeatAccount) throw new Error('account already exists!')
        if (repeatEmail) throw new Error('email already exists!')

        return bcrypt.hash(password, 10)
      })
      .then(hash => User.create({
        account,
        name,
        email,
        password: hash
      }))
      .then(() => res.json({
        status: 'success'
      }))
      .catch(err => next(err))
  },
  signIn: (req, res, next) => {
    try {
      const userData = helpers.getUser(req).toJSON()

      if (userData.role !== 'user') throw new Error('Account or password is wrong!')

      const authToken = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '30d' })

      delete userData.password
      delete userData.role

      res.json({
        status: 'success',
        authToken,
        user: {
          ...userData
        }
      })
    } catch (err) {
      next(err)
    }
  },
  addFollowing: (req, res, next) => {
    const user = helpers.getUser(req)
    const followerId = user.id
    const followingId = Number(req.body.id)

    return Promise.all([
      User.findAll({
        raw: true,
        attributes: ['id']
      }),
      Followship.findOne({ where: { [sequelize.Op.and]: [{ followerId }, { followingId }] } })
    ])
      .then(([users, followship]) => {
        if (!users.some(user => user.id === followingId)) throw new Error("User didn't exist!")
        if (followship) throw new Error('You have followed this user!')
        if (followerId === followingId) throw new Error("You can't follow yourself!")

        return Followship.create({
          followerId,
          followingId
        })
          .then(followship => { res.json({ followship }) })
      })
      .catch(err => next(err))
  },
  removeFollowing: (req, res, next) => {
    const user = helpers.getUser(req)
    const followerId = user.id
    const followingId = Number(req.params.followingId)

    return Promise.all([
      User.findAll({
        raw: true,
        attributes: ['id']
      }),
      Followship.findOne({ where: { [sequelize.Op.and]: [{ followerId }, { followingId }] } })
    ])
      .then(([users, followship]) => {
        if (!users.some(user => user.id === followingId)) throw new Error("User didn't exist!")
        if (!followship) throw new Error("You didn't follow this user!")

        return followship.destroy()
      })
      .then(followship => {
        res.json({ followship })
      })
      .catch(err => next(err))
  },
  getTopFollow: (req, res, next) => {
    const user = helpers.getUser(req)
    const userId = Number(user.id)

    return User.findAll({
      where: { role: 'user' },
      attributes: ['id', 'account', 'name', 'avatar',
        [
          sequelize.literal(`(
            SELECT COUNT(*) FROM Followships 
            WHERE Followships.followingId = User.id
          )`),
          'followerCounts'
        ]
      ],
      order: [
        [sequelize.literal('followerCounts'), 'DESC']
      ],
      include: [{
        model: User,
        as: 'Followers',
        attributes: ['id']
      }]
    })
      .then(users => {
        const topUsers = users.map(user => {
          const userData = {
            ...user.toJSON(),
            isFollowed: user.Followers.some(follower => follower.id === userId)
          }
          delete userData.Followers
          return userData
        })
        res.json({ topUsers: topUsers.slice(0, 10) })
      })
      .catch(err => next(err))
  },
  getUserProfile: (req, res, next) => {
    const id = Number(req.params.id)
    const user = helpers.getUser(req)
    const userId = Number(user.id)

    return User.findByPk(id, {
      include: [
        { model: User, as: 'Followers', attributes: ['id'] }
      ],
      attributes: {
        exclude: ['password', 'role'],
        include: [
          [
            sequelize.literal(`(
                SELECT COUNT(*) FROM Followships 
                WHERE Followships.followingId = ${id}
              )`),
            'followerCounts'
          ],
          [
            sequelize.literal(`(
                SELECT COUNT(*) FROM Followships 
                WHERE Followships.followerId = ${id}
              )`),
            'followingCounts'
          ]
        ]
      }
    })
      .then(user => {
        if (!user) throw new Error("This User didn't exists!")

        const userProfile = {
          ...user.toJSON(),
          isFollowed: user.Followers.some(follower => follower.id === userId)
        }
        delete userProfile.Followers

        return res.json(userProfile)
      })
      .catch(err => next(err))
  },
  getUserTweets: (req, res, next) => {
    const id = Number(req.params.id)
    const user = helpers.getUser(req)
    const userId = Number(user.id)

    return Promise.all([
      Tweet.findAll({
        where: { UserId: id },
        include: [
          { model: User, attributes: ['id', 'account', 'name', 'avatar'] },
          { model: Like, attributes: ['UserId'] }
        ],
        attributes: {
          include: [
            [
              sequelize.literal(`(
                SELECT COUNT(*) FROM Replies 
                WHERE Replies.TweetId = Tweet.id
              )`),
              'replyCounts'
            ],
            [
              sequelize.literal(`(
                SELECT COUNT(*) FROM Likes 
                WHERE Likes.TweetId = Tweet.id
              )`),
              'likeCounts'
            ]
          ]
        },
        order: [['createdAt', 'DESC']]
      }),
      User.findByPk(id)
    ])
      .then(([tweets, user]) => {
        if (!user) throw new Error("This User didn't exists!")

        const userTweets = tweets.map(tweet => {
          const data = {
            ...tweet.toJSON(),
            isLiked: tweet.Likes.some(like => like.UserId === userId),
            period: dayjs(tweet.createdAt).fromNow()
          }
          delete data.Likes

          return data
        })

        res.json(userTweets)
      })
      .catch(err => next(err))
  },
  getUserReplies: (req, res, next) => {
    const id = Number(req.params.id)

    return Promise.all([
      Reply.findAll({
        where: { UserId: id },
        include: [
          { model: User, attributes: ['id', 'account', 'name', 'avatar'] },
          {
            model: Tweet,
            attributes: ['UserId'],
            include: { model: User, attributes: ['id', 'account'] }
          }
        ],
        order: [['createdAt', 'DESC']]
      }),
      User.findByPk(id)
    ])
      .then(([replies, user]) => {
        if (!user) throw new Error("This User didn't exists!")

        const userReplies = replies.map(reply => {
          const data = {
            ...reply.toJSON(),
            period: dayjs(reply.createdAt).fromNow()
          }

          return data
        })

        res.json(userReplies)
      })
      .catch(err => next(err))
  },
  getUserLikes: (req, res, next) => {
    const id = Number(req.params.id)
    const user = helpers.getUser(req)
    const userId = Number(user.id)

    return Promise.all([
      Tweet.findAll({
        include: [
          { model: User, attributes: ['id', 'account', 'name', 'avatar'] },
          { model: Like, attributes: ['UserId', 'createdAt'] }
        ],
        attributes: {
          include: [
            [
              sequelize.literal(`(
                SELECT COUNT(*) FROM Replies 
                WHERE Replies.TweetId = Tweet.id
              )`),
              'replyCounts'
            ],
            [
              sequelize.literal(`(
                SELECT COUNT(*) FROM Likes 
                WHERE Likes.TweetId = Tweet.id
              )`),
              'likeCounts'
            ],
            [
              sequelize.literal(`(
                SELECT createdAt FROM Likes 
                WHERE Likes.UserId = ${id} AND Tweet.id = Likes.TweetId
              )`),
              'likedDate'
            ]
          ]
        },
        order: [[
          sequelize.literal('likedDate'), 'DESC'
        ]]
      }),
      Like.findAll({
        where: { UserId: id },
        attributes: ['TweetId']
      }),
      User.findByPk(id)
    ])
      .then(([tweets, likes, user]) => {
        if (!user) throw new Error("This User didn't exists!")

        const Tweets = tweets.map(tweet => tweet.toJSON())
        const Likes = likes.map(like => like.toJSON())

        const likeTweets = Tweets.filter(tweet => Likes.some(like => like.TweetId === tweet.id))
          .map(tweet => {
            const data = {
              ...tweet,
              isLiked: tweet.Likes.some(like => like.UserId === userId),
              TweetId: tweet.id,
              period: dayjs(tweet.likedDate).fromNow()
            }
            delete data.Likes

            return data
          })

        res.json(likeTweets)
      })
      .catch(err => next(err))
  },
  putUserSetting: (req, res, next) => {
    const user = helpers.getUser(req)
    const userId = Number(user.id)
    const { account, name, email, password, checkPassword } = req.body

    if (!account || !name || !email || !password || !checkPassword) throw new Error('You should input all required parameters')
    if (name.length > 50) throw new Error("Name can't larger than 50 characters!")
    if (password !== checkPassword) throw new Error('Password do not match!')

    return Promise.all([
      User.findAll({
        attributes: ['id'],
        where: {
          id: { [sequelize.Op.ne]: req.params.id },
          account
        }
      }),
      User.findAll({
        attributes: ['id'],
        where: {
          id: { [sequelize.Op.ne]: req.params.id },
          email
        }
      }),
      User.findOne({
        where: { id: req.params.id },
        attributes: {
          exclude: ['role']
        }
      })
    ])
      .then(([repeatAccount, repeatEmail, user]) => {
        if (!user) throw new Error("User did't exist!")
        // 避免有人惡意修改其他人的設定
        if (user.id !== userId) throw new Error("You can't modify other user's setting!")
        // 反查不是該使用者，但是卻已經有相同的account或者email存在的情況 => 表示已經被其他人使用
        if (repeatAccount.length !== 0) throw new Error('account already exists!')
        if (repeatEmail.length !== 0) throw new Error('email already exists!')

        return user.update({
          account,
          email,
          password: bcrypt.hashSync(password, bcrypt.genSaltSync(10)),
          name
        })
      })
      .then(user => {
        const userData = {
          ...user.toJSON()
        }
        delete userData.password
        res.json(userData)
      })
      .catch(err => next(err))
  },
  getUserFollowings: (req, res, next) => {
    const id = Number(req.params.id)
    const user = helpers.getUser(req)
    const userId = Number(user.id)

    return Promise.all([
      User.findAll({
        attributes: ['id', 'account', 'name', 'avatar', 'introduction'],
        // 為了確認是否isFollowed，故include [Followers]
        include: [
          { model: User, as: 'Followers', attributes: ['id'] }
        ]
      }),
      Followship.findAll({
        where: { followerId: id },
        attributes: ['followingId', 'createdAt']
      }),
      User.findByPk(id)
    ])
      .then(([users, followings, user]) => {
        if (!user) throw new Error("This user didn't exist!")

        const Users = users.map(user => user.toJSON())
        const Followings = followings.map(following => following.toJSON())

        const userFollowings = Users.filter(
          user => Followings.some(following => following.followingId === user.id)
        ).map(user => {
          const followingDate = user.Followers.filter(f => f.id === id)[0].Followship.createdAt
          const data = {
            ...user,
            followingId: user.id,
            followingDate,
            isFollowed: user.Followers.some(follower => follower.id === userId)
          }
          delete data.Followers

          return data
        })
          .sort((a, b) => (b.followingDate - a.followingDate))

        res.json(userFollowings)
      })
      .catch(err => next(err))
  },
  getUserFollowers: (req, res, next) => {
    const id = Number(req.params.id)
    const user = helpers.getUser(req)
    const userId = Number(user.id)

    return Promise.all([
      User.findAll({
        attributes: ['id', 'account', 'name', 'avatar', 'introduction'],
        // 為了確認是否isFollowed，故include [Followers]
        include: [
          { model: User, as: 'Followers', attributes: ['id'] },
          { model: User, as: 'Followings', attributes: ['id'] }
        ]
      }),
      Followship.findAll({
        where: { followingId: id },
        attributes: ['followerId', 'createdAt']
      }),
      User.findByPk(id)
    ])
      .then(([users, followers, user]) => {
        if (!user) throw new Error("This user didn't exist!")

        const Users = users.map(user => user.toJSON())
        const Followers = followers.map(follower => follower.toJSON())

        const userFollowers = Users.filter(
          user => Followers.some(follower => follower.followerId === user.id)
        ).map(user => {
          const followerDate = user.Followings.filter(f => f.id === id)[0].Followship.createdAt
          const data = {
            ...user,
            followerId: user.id,
            isFollowed: user.Followers.some(follower => follower.id === userId),
            followerDate
          }
          delete data.Followers
          delete data.Followings

          return data
        })
          .sort((a, b) => (b.followerDate - a.followerDate))

        res.json(userFollowers)
      })
      .catch(err => next(err))
  },
  putUserProfile: (req, res, next) => {
    const user = helpers.getUser(req)
    const userId = Number(user.id)
    const { name, introduction } = req.body
    const { files } = req

    if (!name) throw new Error('Name is required!')
    if (name.length > 50) throw new Error("Name can't larger than 50 characters!")
    if (introduction.length > 160) throw new Error("Introduction can't larger than 160 characters!")

    if (!files) { // test沒有file
      return User.findOne({
        where: { id: req.params.id },
        attributes: { exclude: ['password', 'role'] }
      })
        .then(user => {
          if (!user) throw new Error("User did't exist!")
          // 避免有人惡意修改其他人的設定
          if (user.id !== userId) throw new Error("You can't modify other user's setting!")

          return user.update({
            name,
            introduction
          })
        })
        .then(user => res.json(user))
        .catch(err => next(err))
    } else {
      return Promise.all([
        User.findOne({
          where: { id: req.params.id },
          attributes: { exclude: ['password', 'role'] }
        }),
        imgurFileHandler(files.avatar === undefined ? null : files.avatar[0]),
        imgurFileHandler(files.cover === undefined ? null : files.cover[0])
      ])
        .then(([user, avatar, cover]) => {
          if (!user) throw new Error("User did't exist!")
          // 避免有人惡意修改其他人的設定
          if (user.id !== userId) throw new Error("You can't modify other user's setting!")

          return user.update({
            name,
            introduction,
            avatar: avatar || user.avatar,
            cover: cover || user.cover
          })
        })
        .then(user => res.json(user))
        .catch(err => next(err))
    }
  }
}

module.exports = userController
