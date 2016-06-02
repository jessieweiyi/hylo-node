import { filter, includes, map, merge } from 'lodash'
import { fetchAndPresentFollowed, fetchAndPresentCreated, withRelatedSpecialPost, presentWithPost } from '../services/TagPresenter'

module.exports = {

  findOne: function (req, res) {
    return Tag.find(req.param('tagName'), withRelatedSpecialPost)
    .then(tag => tag ? res.ok(presentWithPost(tag)) : res.notFound())
    .catch(res.serverError)
  },

  findOneInCommunity: function (req, res) {
    let tag
    return Tag.find(req.param('tagName'), withRelatedSpecialPost)
    .then(t => {
      if (!t) return
      tag = t
      return CommunityTag
      .where({community_id: res.locals.community.id, tag_id: tag.id})
      .fetch({withRelated: [
        'owner',
        {'community.tagFollows': q => q.where({
          'tag_follows.tag_id': tag.id,
          'tag_follows.user_id': req.session.userId
        })}
      ]})
    })
    .then(ct => {
      if (!ct) return res.notFound()
      return res.ok(merge(
        ct.pick('description', 'community_id'),
        presentWithPost(tag),
        {
          owner: ct.relations.owner.pick('id', 'name', 'avatar_url'),
          followed: ct.relations.community.relations.tagFollows.length > 0,
          created: ct.relations.owner.id === req.session.userId
        }
      ))
    })
    .catch(res.serverError)
  },

  findFollowed: function (req, res) {
    return Community.find(req.param('communityId'))
    .then(com => fetchAndPresentFollowed(com.id, req.session.userId))
    .then(res.ok, res.serverError)
  },

  findForLeftNav: function (req, res) {
    return Community.find(req.param('communityId'))
    .then(com => Promise.join(
      fetchAndPresentFollowed(com.id, req.session.userId),
      fetchAndPresentCreated(com.id, req.session.userId),
      (followed, created) => ({
        followed: filter(followed, f => !includes(map(created, 'name'), f.name)),
        created
      })
    ))
    .then(res.ok, res.serverError)
  },

  follow: function (req, res) {
    return Promise.join(
      Tag.find(req.param('tagName')),
      Community.find(req.param('communityId')),
      (tag, community) => {
        if (!tag) return res.notFound()

        const attrs = {
          community_id: community.id,
          tag_id: tag.id,
          user_id: req.session.userId
        }

        return TagFollow.where(attrs).fetch()
        .then(tf => tf ? tf.destroy() : new TagFollow(attrs).save())
      })
    .then(res.ok, res.serverError)
  },

  resetNewPostCount: function (req, res) {
    return Promise.join(
      Tag.find(req.param('tagName')),
      Community.find(req.param('communityId')),
      (tag, community) => {
        console.log({tag, community})
      })
    .then(res.ok)
  }
}
