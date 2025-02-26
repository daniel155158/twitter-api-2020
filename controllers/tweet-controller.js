const { Tweet, User, Like, Reply } = require('../models')
const helpers = require('../_helpers')
const dayjs = require('dayjs')
const relativeTime = require('dayjs/plugin/relativeTime')
dayjs.extend(relativeTime)
require('dayjs/locale/zh-tw')
dayjs.locale('zh-tw')
const sequelize = require('sequelize')

const tweetController = {
  postTweet: (req, res, next) => {
    const { description } = req.body
    if (!description) throw new Error('description is required')

    const user = helpers.getUser(req)
    const UserId = user.id

    return User.findByPk(UserId)
      .then(user => {
        if (!user) throw new Error("User didn't exist!")

        return Tweet.create({
          UserId,
          description
        })
      })
      .then(tweet => {
        res.json({
          tweet
        })
      })
      .catch(err => next(err))
  },
  getTweets: (req, res, next) => {
    const user = helpers.getUser(req)
    const UserId = Number(user.id)

    return Tweet.findAll({
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
      include: [
        { model: User, attributes: ['id', 'name', 'account', 'avatar'] },
        { model: Like }
      ],
      order: [['createdAt', 'DESC']]
    })
      .then(tweets => {
        const tweetsData = tweets.map(tweet => {
          const data = {
            ...tweet.toJSON(),
            period: dayjs(tweet.createdAt).fromNow(),
            isLiked: tweet.Likes.some(like => like.UserId === UserId)
          }
          delete data.Likes
          return data
        })

        res.json(tweetsData)
      })
      .catch(err => next(err))
  },
  getTweet: (req, res, next) => {
    const id = req.params.tweet_id
    const user = helpers.getUser(req)
    const UserId = Number(user.id)

    return Tweet.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'account', 'name', 'avatar'] },
        { model: Like }
      ],
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT COUNT(*) FROM Replies
              WHERE Replies.TweetId = ${id}
            )`),
            'replyCounts'
          ],
          [
            sequelize.literal(`(
              SELECT COUNT(*) FROM Likes 
              WHERE Likes.TweetId = ${id}
            )`),
            'likeCounts'
          ]
        ]
      }
    })
      .then(tweet => {
        if (!tweet) throw new Error("Tweet didn't exist!")
        const date = new Date(tweet.createdAt).toLocaleString('zh-TW', {
          hour12: true,
          hour: 'numeric',
          minute: 'numeric',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }).split(' ')
        const createdAt = date[1] + '．' + date[0]

        const tweetData = {
          ...tweet.toJSON(),
          createdAt,
          period: dayjs(tweet.createdAt).fromNow(),
          isLiked: tweet.Likes.some(like => like.UserId === UserId)
        }
        delete tweetData.Likes

        res.json(tweetData)
      })
      .catch(err => next(err))
  },
  postReply: (req, res, next) => {
    const { comment } = req.body
    if (!comment) throw new Error('comment is required')

    const user = helpers.getUser(req)
    const UserId = user.id
    const TweetId = Number(req.params.tweet_id)

    return Promise.all([
      User.findByPk(UserId),
      Tweet.findByPk(TweetId)
    ])
      .then(([user, tweet]) => {
        if (!user) throw new Error("User didn't exist!")
        if (!tweet) throw new Error("Tweet didn't exist!")

        return Reply.create({
          UserId,
          TweetId,
          comment
        })
      })
      .then(reply => res.json({
        reply
      }))
      .catch(err => next(err))
  },
  getReplies: (req, res, next) => {
    const id = req.params.tweet_id
    const TweetId = Number(req.params.tweet_id)

    return Promise.all([
      Reply.findAll({
        where: { TweetId: id },
        include: [
          { model: User, attributes: ['id', 'account', 'name', 'avatar'] },
          {
            model: Tweet,
            attributes: ['UserId'],
            include: { model: User, attributes: ['id', 'account', 'name', 'avatar'] }
          }
        ],
        order: [['createdAt', 'DESC']],
        raw: true,
        nest: true
      }),
      Tweet.findByPk(TweetId)
    ])
      .then(([replies, tweet]) => {
        if (!tweet) throw new Error("Tweet didn't exist!")

        const repliesData = replies.map(reply => ({
          ...reply,
          period: dayjs(reply.createdAt).fromNow()
        }))
        res.json(repliesData)
      })
      .catch(err => next(err))
  },
  likeTweet: (req, res, next) => {
    const { id } = req.params
    const user = helpers.getUser(req)
    const UserId = user.id

    return Promise.all([
      Tweet.findByPk(id),
      Like.findOne({
        where: {
          TweetId: id,
          UserId
        }
      })
    ])
      .then(([tweet, like]) => {
        if (!tweet) throw new Error("Tweet didn't exist!")
        if (like) throw new Error('You have liked this tweet!')

        return Like.create({
          TweetId: id,
          UserId
        })
      })
      .then(like => res.json(like))
      .catch(err => next(err))
  },
  unlikeTweet: (req, res, next) => {
    const { id } = req.params
    const user = helpers.getUser(req)
    const UserId = user.id

    return Promise.all([
      Tweet.findByPk(id),
      Like.findOne({
        where: {
          TweetId: id,
          UserId
        }
      })
    ])
      .then(([tweet, like]) => {
        if (!tweet) throw new Error("Tweet didn't exist!")
        if (!like) throw new Error("You haven't liked this tweet")

        return like.destroy()
      })
      .then(like => res.json(like))
      .catch(err => next(err))
  }
}

module.exports = tweetController
