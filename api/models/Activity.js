import { values, merge, pick, filter, includes, isEmpty, get } from 'lodash'

const isJustNewPost = activity => {
  const reasons = activity.get('meta').reasons
  return reasons.every(reason => reason.match(/^newPost/))
}

const mergeByReader = activities => {
  const fields = ['actor_id', 'community_id']
  const merged = activities.reduce((acc, activity) => {
    const current = acc[activity.reader_id]
    if (acc[activity.reader_id]) {
      fields.forEach(f => {
        if (activity[f]) current[f] = activity[f]
      })
      current.reasons.push(activity.reason)
    } else {
      activity.reasons = [activity.reason]
      acc[activity.reader_id] = activity
    }
    return acc
  }, {})
  return values(merged)
}

const removeForRelation = (model) => (id, trx) => {
  const trxOpt = {transacting: trx}
  return Activity.where(`${model}_id`, id).query()
  .pluck('id').transacting(trx)
  .then(ids =>
    Notification.where('activity_id', 'in', ids).destroy(trxOpt)
    .then(() => Activity.where('id', 'in', ids).destroy(trxOpt)))
}

module.exports = bookshelf.Model.extend({
  tableName: 'activity',

  actor: function () {
    return this.belongsTo(User, 'actor_id')
  },

  reader: function () {
    return this.belongsTo(User, 'reader_id')
  },

  comment: function () {
    return this.belongsTo(Comment)
  },

  post: function () {
    return this.belongsTo(Post)
  },

  community: function () {
    return this.belongsTo(Community)
  },

  notifications: function () {
    return this.hasMany(Notification)
  },

  createNotifications: function (trx) {
    var self = this
    return self.load([
      'reader',
      'reader.memberships',
      'post',
      'post.communities',
      'comment',
      'comment.post',
      'comment.post.communities',
      'community'
    ], {transacting: trx})
    .then(() => Promise.map(Activity.generateNotificationMedia(self), medium =>
      new Notification({
        activity_id: self.id,
        medium
      }).save({}, {transacting: trx})))
  }

}, {
  Reason: {
    Mention: 'mention', // you are mentioned in a post or comment
    Comment: 'comment', // someone makes a comment on a post you follow
    FollowAdd: 'followAdd', // you are added as a follower
    Follow: 'follow', // someone follows your post
    Unfollow: 'unfollow' // someone leaves your post
  },

  find: function (id) {
    return this.where({id}).fetch()
  },

  filterInactiveContent: q => {
    q.whereRaw('(comment.active = true or comment.id is null)')
    .leftJoin('comment', function () {
      this.on('comment.id', '=', 'activity.comment_id')
    })

    q.whereRaw('(post.active = true or post.id is null)')
    .leftJoin('post', function () {
      this.on('post.id', '=', 'activity.post_id')
    })
  },

  joinWithCommunity: (communityId, q) => {
    q.where('post_community.community_id', communityId)
    .join('post_community', function () {
      this.on('comment.post_id', 'post_community.post_id')
      .orOn('post.id', 'post_community.post_id')
    })
  },

  forComment: function (comment, userId, action) {
    if (!action) {
      action = _.includes(comment.mentions(), userId.toString())
        ? this.Reason.Mention
        : this.Reason.Comment
    }

    return new Activity({
      reader_id: userId,
      actor_id: comment.get('user_id'),
      comment_id: comment.id,
      post_id: comment.get('post_id'),
      action: action,
      created_at: comment.get('created_at')
    })
  },

  forPostMention: function (post, userId) {
    return new Activity({
      reader_id: userId,
      actor_id: post.get('user_id'),
      post_id: post.id,
      meta: {reasons: [this.Reason.Mention]},
      created_at: post.get('created_at')
    })
  },

  forFollowAdd: function (follow, userId) {
    return new Activity({
      reader_id: userId,
      actor_id: follow.get('added_by_id'),
      post_id: follow.get('post_id'),
      meta: {reasons: [this.Reason.FollowAdd]},
      created_at: follow.get('date_added')
    })
  },

  forFollow: function (follow, userId) {
    return new Activity({
      reader_id: userId,
      actor_id: follow.get('user_id'),
      post_id: follow.get('post_id'),
      meta: {reasons: [this.Reason.Follow]},
      created_at: follow.get('date_added')
    })
  },

  forUnfollow: function (post, unfollowerId) {
    return new Activity({
      reader_id: post.get('user_id'),
      actor_id: unfollowerId,
      post_id: post.id,
      meta: {reasons: [this.Reason.Unfollow]},
      created_at: new Date()
    })
  },

  unreadCountForUser: function (user) {
    return Activity.query().where({reader_id: user.id, unread: true}).count()
    .then(rows => rows[0].count)
  },

  saveForReasons: function (activities, trx) {
    return Promise.map(mergeByReader(activities), activity =>
      Activity.createWithNotifications(
        merge(pick(activity, ['post_id', 'community_id', 'comment_id', 'actor_id', 'reader_id']),
          {meta: {reasons: activity.reasons}}),
        trx))
    .tap(() => Queue.classMethod('Notification', 'sendUnsent'))
  },

  communityIds: function (activity) {
    if (activity.get('post_id')) {
      return get(activity, 'relations.post.relations.communities', []).map(c => c.id)
    } else if (activity.get('comment_id')) {
      return get(activity, 'relations.comment.relations.post.relations.communities', []).map(c => c.id)
    } else if (activity.get('community_id')) {
      return [activity.relations.community.id]
    }
    return []
  },

  generateNotificationMedia: function (activity) {
    var notifications = []
    var communities = Activity.communityIds(activity)
    var user = activity.relations.reader

    const relevantMemberships = filter(user.relations.memberships.models, mem => includes(communities, mem.get('community_id')))
    const membershipsPermitting = (setting) =>
      filter(relevantMemberships, mem => mem.get('settings')[setting])

    const emailable = membershipsPermitting('send_email')
    const pushable = membershipsPermitting('send_push_notifications')

    if (!isEmpty(emailable) && !isJustNewPost(activity)) {
      notifications.push(Notification.MEDIUM.Email)
    }

    if (!isEmpty(pushable)) {
      notifications.push(Notification.MEDIUM.Push)
    }

    if (!isJustNewPost(activity)) {
      notifications.push(Notification.MEDIUM.InApp)
    }

    return notifications
  },

  createWithNotifications: function (attributes, trx) {
    return new Activity(_.merge(attributes, {created_at: new Date()}))
    .save({}, {transacting: trx})
    .tap(activity => activity.createNotifications(trx))
  },

  removeForComment: removeForRelation('comment'),
  removeForPost: removeForRelation('post')
})
