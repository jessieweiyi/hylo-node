const api = require('sendwithus')(process.env.SENDWITHUS_KEY)
const Promise = require('bluebird')

const sendEmail = function (opts) {
  return new Promise((resolve, reject) => {
    api.send(opts, (err, resp) => {
      err ? reject(resp) : resolve(resp)
    })
  })
}

const defaultOptions = {
  sender: {
    address: process.env.EMAIL_SENDER,
    name: 'Hylo'
  }
}

const sendSimpleEmail = function (address, templateId, data, extraOptions) {
  return sendEmail(_.merge({}, defaultOptions, {
    email_id: templateId,
    recipient: {address},
    email_data: data
  }, extraOptions))
}

module.exports = {
  sendSimpleEmail,

  sendRawEmail: function (email, data, extraOptions) {
    return sendSimpleEmail(email, 'tem_nt4RmzAfN4KyPZYxFJWpFE', data, extraOptions)
  },

  sendPasswordReset: function (opts) {
    return sendSimpleEmail(opts.email, 'tem_mccpcJNEzS4822mAnDNmGT', opts.templateData)
  },

  sendInvitation: function (email, data) {
    return sendEmail(_.merge({}, defaultOptions, {
      email_id: 'tem_ZXZuvouDYKKhCrdEWYbEp9',
      recipient: {address: email},
      email_data: data,
      version_name: 'user-edited text',
      sender: {
        name: format('%s (via Hylo)', data.inviter_name),
        reply_to: data.inviter_email
      }
    }))
  },

  sendTagInvitation: function (email, data) {
    return sendEmail(_.merge({}, defaultOptions, {
      email_id: 'tem_tmEEpPvtQ69wGkmf9njCx8',
      recipient: {address: email},
      email_data: data,
      version_name: 'default',
      sender: {
        name: format('%s (via Hylo)', data.inviter_name),
        reply_to: data.inviter_email
      }
    }))
  },

  sendNewCommentNotification: function (opts) {
    return sendEmail(_.merge({}, defaultOptions, {
      email_id: 'tem_tP6JzrYzvvDXhgTNmtkxuW',
      recipient: {address: opts.email},
      email_data: opts.data,
      version_name: opts.version,
      sender: opts.sender
    }))
  },

  sendPostMentionNotification: function (opts) {
    return sendEmail(_.merge({}, defaultOptions, {
      email_id: 'tem_wXiqtyNzAr8EF4fqBna5WQ',
      recipient: {address: opts.email},
      email_data: opts.data,
      sender: opts.sender
    }))
  },

  postReplyAddress: function (postId, userId) {
    var plaintext = format('%s%s|%s', process.env.MAILGUN_EMAIL_SALT, postId, userId)
    return format('reply-%s@%s', PlayCrypto.encrypt(plaintext), process.env.MAILGUN_DOMAIN)
  },

  decodePostReplyAddress: function (address) {
    var salt = new RegExp(format('^%s', process.env.MAILGUN_EMAIL_SALT))
    var match = address.match(/reply-(.*?)@/)
    var plaintext = PlayCrypto.decrypt(match[1]).replace(salt, '')
    var ids = plaintext.split('|')

    return {postId: ids[0], userId: ids[1]}
  },

  postCreationAddress: function (communityId, userId, type) {
    var plaintext = format('%s%s|%s|', process.env.MAILGUN_EMAIL_SALT, communityId, userId, type)
    return format('create-%s@%s', PlayCrypto.encrypt(plaintext), process.env.MAILGUN_DOMAIN)
  },

  decodePostCreationAddress: function (address) {
    var salt = new RegExp(format('^%s', process.env.MAILGUN_EMAIL_SALT))
    var match = address.match(/create-(.*?)@/)
    var plaintext = PlayCrypto.decrypt(match[1]).replace(salt, '')
    var decodedData = plaintext.split('|')

    return {communityId: decodedData[0], userId: decodedData[1], type: decodedData[2]}
  },

  postCreationToken: function (communityId, userId) {
    var plaintext = format('%s%s|%s|', process.env.MAILGUN_EMAIL_SALT, communityId, userId)
    return PlayCrypto.encrypt(plaintext)
  },

  decodePostCreationToken: function (token) {
    var salt = new RegExp(format('^%s', process.env.MAILGUN_EMAIL_SALT))
    var plaintext = PlayCrypto.decrypt(token).replace(salt, '')
    var decodedData = plaintext.split('|')

    return {communityId: decodedData[0], userId: decodedData[1]}
  }

}
