var format = require('util').format,
  Promise = require('bluebird');

module.exports = bookshelf.Model.extend({
  tableName: 'comment',

  user: function() {
    return this.belongsTo(User);
  },

  post: function() {
    return this.belongsTo(Post);
  },

  text: function() {
    return this.get('comment_text');
  }
}, {

  find: function(id, options) {
    return Comment.where({id: id}).fetch(options);
  },

  queueNotificationEmail: function(recipientId, commentId, version) {
    var queue = require('kue').createQueue();

    var job = queue.create('Comment.sendNotificationEmail', {
      recipientId: recipientId,
      commentId: commentId,
      version: version
    })
    .delay(5000) // because the job is queued while an object it depends upon hasn't been saved yet
    .attempts(3)
    .backoff({delay: 5000, type: 'exponential'});

    return Promise.promisify(job.save, job)();
  },

  sendNotificationEmail: function(recipientId, commentId, version) {
    // the version argument corresponds to names of versions in SendWithUs

    return Promise.join(
      User.find(recipientId),
      Comment.find(commentId, {
        withRelated: [
          'user', 'post', 'post.communities', 'post.creator'
        ]
      })
    )
    .spread(function(recipient, comment) {

      var seed = comment.relations.post,
        commenter = comment.relations.user,
        creator = seed.relations.creator,
        community = seed.relations.communities.models[0],
        text = comment.get('comment_text'),
        replyTo = Email.seedReplyAddress(seed.id, recipient.id);

      var seedLabel = format('%s %s',
        (recipient.id == creator.id ? 'your' : 'the'), seed.get('type'));

      text = RichText.qualifyLinks(text);

      return Email.sendNewCommentNotification({
        version: version,
        email: recipient.get('email'),
        sender: {
          address: replyTo,
          reply_to: replyTo,
          name: format('%s (via Hylo)', commenter.get('name'))
        },
        data: {
          community_name:        community.get('name'),
          commenter_name:        commenter.get('name'),
          commenter_avatar_url:  commenter.get('avatar_url'),
          commenter_profile_url: Frontend.Route.profile(commenter),
          comment_text:          text,
          seed_label:            seedLabel,
          seed_title:            seed.get('name'),
          seed_url:              Frontend.Route.seed(seed, community),
          unfollow_url:          Frontend.Route.unfollow(seed)
        }
      });

    })

  },

});
