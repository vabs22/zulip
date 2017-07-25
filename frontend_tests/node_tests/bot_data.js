add_dependencies({
    people: 'js/people.js',
});

var _ = global._;

set_global('$', function (f) {
    if (f) {
        return f();
    }
    return {trigger: function () {}};
});
set_global('document', null);

var page_params = {
    realm_bots: [{email: 'bot0@zulip.com', full_name: 'Bot 0'}],
    is_admin: false,
    realm_bots_services: [{email: 'testbot@zulip.com', base_url: 'http://example.domain.com',
        interface:1, name: 'test'}],
};
set_global('page_params', page_params);

global.people.add({
    email: 'owner@zulip.com',
    full_name: 'The Human Boss',
    user_id: 42,
});

global.people.initialize_current_user(42);

var patched_underscore = _.clone(_);
patched_underscore.debounce = function (f) { return f; };
global.patch_builtin('_', patched_underscore);


var bot_data = require('js/bot_data.js');

bot_data.initialize();
// Our startup logic should have added Bot 0 from page_params.
assert.equal(bot_data.get('bot0@zulip.com').full_name, 'Bot 0');
assert.equal(bot_data.get_bot_service('testbot@zulip.com').base_url, 'http://example.domain.com');
assert.equal(bot_data.get_bot_service('testbot@zulip.com').name, 'test');

(function () {
    var test_bot = {
        email: 'bot1@zulip.com',
        avatar_url: '',
        full_name: 'Bot 1',
        extra: 'Not in data',
    };

    var test_bot_service_1 = {
        base_url: 'http://example.domain1.com',
        interface: 1,
        name: 'test1',
        token: 'abcd',
        email: 'bot1@zulip.com',
    };

    var test_bot_service_2 = {
        base_url: 'http://example.domain2.com',
        interface: 1,
        name: 'test2',
        token: 'abcd',
        email: 'bot1@zulip.com',
    };

    (function test_add_bot_service() {
        bot_data.add_bot_service(test_bot_service_1);

        var service = bot_data.get_bot_service('bot1@zulip.com');
        assert.equal('http://example.domain1.com', service.base_url);
        assert.equal('test1', service.name);
    }());

    (function test_update_bot_service() {
        bot_data.update_bot_service('bot1@zulip.com', test_bot_service_2);

        var service = bot_data.get_bot_service('bot1@zulip.com');
        assert.equal('http://example.domain2.com', service.base_url);
        assert.equal('test2', service.name);
    }());

    (function test_add() {
        bot_data.add(test_bot);

        var bot = bot_data.get('bot1@zulip.com');
        assert.equal('Bot 1', bot.full_name);
        assert.equal(undefined, bot.extra);
    }());

    (function test_update() {
        var bot;

        bot_data.add(test_bot);

        bot = bot_data.get('bot1@zulip.com');
        assert.equal('Bot 1', bot.full_name);
        bot_data.update('bot1@zulip.com', {full_name: 'New Bot 1'});
        bot = bot_data.get('bot1@zulip.com');
        assert.equal('New Bot 1', bot.full_name);
    }());

    (function test_remove() {
        var bot;

        bot_data.add(_.extend({}, test_bot, {is_active: true}));

        bot = bot_data.get('bot1@zulip.com');
        assert.equal('Bot 1', bot.full_name);
        assert(bot.is_active);
        bot_data.deactivate('bot1@zulip.com');
        bot = bot_data.get('bot1@zulip.com');
        assert.equal(bot.is_active, false);
    }());

    (function test_owner_can_admin() {
        var bot;

        bot_data.add(_.extend({owner: 'owner@zulip.com'}, test_bot));

        bot = bot_data.get('bot1@zulip.com');
        assert(bot.can_admin);

        bot_data.add(_.extend({owner: 'notowner@zulip.com'}, test_bot));

        bot = bot_data.get('bot1@zulip.com');
        assert.equal(false, bot.can_admin);
    }());

    (function test_admin_can_admin() {
        var bot;
        page_params.is_admin = true;

        bot_data.add(test_bot);

        bot = bot_data.get('bot1@zulip.com');
        assert(bot.can_admin);

        page_params.is_admin = false;
    }());

    (function test_get_editable() {
        var can_admin;

        bot_data.add(_.extend({}, test_bot, {owner: 'owner@zulip.com', is_active: true}));
        bot_data.add(_.extend({}, test_bot, {email: 'bot2@zulip.com', owner: 'owner@zulip.com', is_active: true}));
        bot_data.add(_.extend({}, test_bot, {email: 'bot3@zulip.com', owner: 'not_owner@zulip.com', is_active: true}));

        can_admin = _.pluck(bot_data.get_editable(), 'email');
        assert.deepEqual(['bot1@zulip.com', 'bot2@zulip.com'], can_admin);

        page_params.is_admin = true;

        can_admin = _.pluck(bot_data.get_editable(), 'email');
        assert.deepEqual(['bot1@zulip.com', 'bot2@zulip.com'], can_admin);
    }());

    (function test_get_all_bots_for_current_user() {
        var bots = bot_data.get_all_bots_for_current_user();

        assert.equal(bots.length, 2);
        assert.equal(bots[0].email, 'bot1@zulip.com');
        assert.equal(bots[1].email, 'bot2@zulip.com');
    }());
}());
