var setup = require(require('root-path')('test/setup')),
  Promise = require('bluebird');

describe('Skill', function() {

  var cat = new User({name: 'Cat'}),
    otherCat = new User({name: 'Other Cat'});

  before(function(done) {
    setup.initDb(function() {
      Promise.join(cat.save(), otherCat.save())
      .then(function() {
        return Promise.join(
          new Skill({skill_name: 'meowing', users_id: cat.id}).save(),
          new Skill({skill_name: 'clawing', users_id: cat.id}).save(),
          new Skill({skill_name: 'meowing', users_id: otherCat.id}).save()
        );
      })
      .then(done.bind(this, null))
      .catch(done);
    });
  });

  after(function(done) {
    setup.clearDb(done);
  });

  describe('#update', function() {

    it('adds and removes skills for one user', function(done) {
      Skill.update(['clawing', 'sleeping', 'pouncing'], cat.id).then(function() {
        return cat.load('skills');
      }).then(function() {
        var skills = Skill.simpleList(cat.relations.skills);
        expect(skills).to.deep.equal(['clawing', 'sleeping', 'pouncing']);
        return otherCat.load('skills');
      }).then(function() {
        // should not affect other users' skills
        var skills = Skill.simpleList(otherCat.relations.skills);
        expect(skills).to.deep.equal(['meowing']);
      }).exec(done);
    });

    it('makes no changes if the list is the same', function(done) {
      // the order of skills is reversed in this argument
      Skill.update(['meowing', 'clawing'], cat.id).then(function() {
        return cat.load('skills');
      }).then(function() {
        var skills = Skill.simpleList(cat.relations.skills);
        // but the stored order is still the original one,
        // because no changes were made to the database
        expect(skills).to.deep.equal(['clawing', 'meowing']);
      }).exec(done);
    });

  })

});