global.stub_out_jquery();

set_global('page_params', {
    people_list: [],
});

set_global('feature_flags', {});

set_global('document', {
    hasFocus: function () {
        return true;
    },
});

add_dependencies({
    Handlebars: 'handlebars',
    templates: 'js/templates',
    util: 'js/util.js',
    compose_fade: 'js/compose_fade.js',
    people: 'js/people.js',
    unread: 'js/unread.js',
    hashchange: 'js/hashchange.js',
    narrow: 'js/narrow.js',
    activity: 'js/activity.js',
});

set_global('resize', {
    resize_page_components: function () {},
});

var alice = {
    email: 'alice@zulip.com',
    user_id: 1,
    full_name: 'Alice Smith',
    bool_buddy: false,
};
var fred = {
    email: 'fred@zulip.com',
    user_id: 2,
    full_name: "Fred Flintstone",
    bool_buddy: true,
};
var jill = {
    email: 'jill@zulip.com',
    user_id: 3,
    full_name: 'Jill Hill',
    bool_buddy: true,
};
var mark = {
    email: 'mark@zulip.com',
    user_id: 4,
    full_name: 'Marky Mark',
    bool_buddy: false,
};
var norbert = {
    email: 'norbert@zulip.com',
    user_id: 5,
    full_name: 'Norbert Oswald',
    bool_buddy: false,
};

global.people.add(alice);
global.people.add(fred);
global.people.add(jill);
global.people.add(mark);
global.people.add(norbert);

var people = global.people;

var activity = require('js/activity.js');
var compose_fade = require('js/compose_fade.js');
var jsdom = require('jsdom');
var window = jsdom.jsdom().defaultView;

global.$ = require('jquery')(window);
$.fn.expectOne = function () {
    assert(this.length === 1);
    return this;
};

compose_fade.update_faded_users = function () {};
activity.update_huddles = function () {};

global.compile_template('user_presence_row');
global.compile_template('user_presence_rows');

(function test_sort_users() {
    var user_ids = [alice.user_id, fred.user_id, jill.user_id];

    var user_info = {};
    user_info[alice.user_id] = { status: 'inactive' };
    user_info[fred.user_id] = { status: 'active' };
    user_info[jill.user_id] = { status: 'active' };

    activity._sort_users(user_ids, user_info);

    assert.deepEqual(user_ids, [
        fred.user_id,
        jill.user_id,
        alice.user_id,
    ]);
}());

(function test_process_loaded_messages() {

    var huddle1 = 'jill@zulip.com,norbert@zulip.com';
    var timestamp1 = 1382479029; // older

    var huddle2 = 'alice@zulip.com,fred@zulip.com';
    var timestamp2 = 1382479033; // newer

    var old_timestamp = 1382479000;

    var messages = [{
            type: 'private',
            reply_to: huddle1,
            timestamp: timestamp1,
        },
        {
            type: 'stream',
        },
        {
            type: 'private',
            reply_to: 'ignore@zulip.com',
        },
        {
            type: 'private',
            reply_to: huddle2,
            timestamp: timestamp2,
        },
        {
            type: 'private',
            reply_to: huddle2,
            timestamp: old_timestamp,
        },
    ];

    activity.process_loaded_messages(messages);

    var user_ids_string1 = people.emails_strings_to_user_ids_string(huddle1);
    var user_ids_string2 = people.emails_strings_to_user_ids_string(huddle2);
    assert.deepEqual(activity.get_huddles(), [user_ids_string2, user_ids_string1]);
}());

(function test_full_huddle_name() {
    function full_name(emails_string) {
        var user_ids_string = people.emails_strings_to_user_ids_string(emails_string);
        return activity.full_huddle_name(user_ids_string);
    }

    assert.equal(
        full_name('alice@zulip.com,jill@zulip.com'),
        'Alice Smith, Jill Hill');

    assert.equal(
        full_name('alice@zulip.com,fred@zulip.com,jill@zulip.com'),
        'Alice Smith, Fred Flintstone, Jill Hill');
}());

(function test_short_huddle_name() {
    function short_name(emails_string) {
        var user_ids_string = people.emails_strings_to_user_ids_string(emails_string);
        return activity.short_huddle_name(user_ids_string);
    }

    assert.equal(
        short_name('alice@zulip.com'),
        'Alice Smith');

    assert.equal(
        short_name('alice@zulip.com,jill@zulip.com'),
        'Alice Smith, Jill Hill');

    assert.equal(
        short_name('alice@zulip.com,fred@zulip.com,jill@zulip.com'),
        'Alice Smith, Fred Flintstone, Jill Hill');

    assert.equal(
        short_name('alice@zulip.com,fred@zulip.com,jill@zulip.com,mark@zulip.com'),
        'Alice Smith, Fred Flintstone, Jill Hill, + 1 other');

    assert.equal(
        short_name('alice@zulip.com,fred@zulip.com,jill@zulip.com,mark@zulip.com,norbert@zulip.com'),
        'Alice Smith, Fred Flintstone, Jill Hill, + 2 others');

}());

(function test_huddle_fraction_present() {
    var huddle = 'alice@zulip.com,fred@zulip.com,jill@zulip.com,mark@zulip.com';
    huddle = people.emails_strings_to_user_ids_string(huddle);

    var presence_list = {};
    presence_list[alice.user_id] = { status: 'active' };
    presence_list[fred.user_id] = { status: 'idle' }; // counts as present
    // jill not in list
    presence_list[mark.user_id] = { status: 'offline' }; // does not count

    assert.equal(
        activity.huddle_fraction_present(huddle, presence_list),
        '0.50');
}());


(function test_on_mobile_property() {
    var base_time = 500;
    var presence = {
        website: {
            status: "active",
            timestamp: base_time,
        },
    };
    var status = activity._status_from_timestamp(
        base_time + activity._OFFLINE_THRESHOLD_SECS - 1, presence);
    assert.equal(status.mobile, false);

    presence.Android = {
        status: "active",
        timestamp: base_time + activity._OFFLINE_THRESHOLD_SECS / 2,
        pushable: false,
    };
    status = activity._status_from_timestamp(
        base_time + activity._OFFLINE_THRESHOLD_SECS, presence);
    assert.equal(status.mobile, true);
    assert.equal(status.status, "active");

    status = activity._status_from_timestamp(
        base_time + activity._OFFLINE_THRESHOLD_SECS - 1, presence);
    assert.equal(status.mobile, false);
    assert.equal(status.status, "active");

    status = activity._status_from_timestamp(
        base_time + activity._OFFLINE_THRESHOLD_SECS * 2, presence);
    assert.equal(status.mobile, false);
    assert.equal(status.status, "offline");

    presence.Android = {
        status: "idle",
        timestamp: base_time + activity._OFFLINE_THRESHOLD_SECS / 2,
        pushable: true,
    };
    status = activity._status_from_timestamp(
        base_time + activity._OFFLINE_THRESHOLD_SECS, presence);
    assert.equal(status.mobile, true);
    assert.equal(status.status, "idle");

    status = activity._status_from_timestamp(
        base_time + activity._OFFLINE_THRESHOLD_SECS - 1, presence);
    assert.equal(status.mobile, false);
    assert.equal(status.status, "active");

    status = activity._status_from_timestamp(
        base_time + activity._OFFLINE_THRESHOLD_SECS * 2, presence);
    assert.equal(status.mobile, true);
    assert.equal(status.status, "offline");

}());

activity.presence_info = {};
activity.presence_info[alice.user_id] = { status: activity.IDLE };
activity.presence_info[fred.user_id] = { status: activity.ACTIVE };
activity.presence_info[jill.user_id] = { status: activity.ACTIVE };
activity.presence_info[mark.user_id] = { status: activity.IDLE };
activity.presence_info[norbert.user_id] = { status: activity.ACTIVE };

activity.buddy_list = [fred.user_id, jill.user_id];

(function test_presence_list_full_update() {
    var users = activity.update_users();
    assert.deepEqual(users, [{
            name: 'Norbert Oswald',
            href: '#narrow/pm-with/5-norbert',
            user_id: norbert.user_id,
            num_unread: 0,
            type: 'active',
            type_desc: 'is active',
            mobile: undefined,
            bool_buddy: false.toString(),
        },
        {
            name: 'Alice Smith',
            href: '#narrow/pm-with/1-alice',
            user_id: alice.user_id,
            num_unread: 0,
            type: 'idle',
            type_desc: 'is not active',
            mobile: undefined,
            bool_buddy: false.toString(),
        },
        {
            name: 'Marky Mark',
            href: '#narrow/pm-with/4-mark',
            user_id: mark.user_id,
            num_unread: 0,
            type: 'idle',
            type_desc: 'is not active',
            mobile: undefined,
            bool_buddy: false.toString(),
        },
    ]);
}());

(function test_presence_list_partial_update() {
    activity.presence_info[alice.user_id] = { status: 'active' };
    activity.presence_info[mark.user_id] = { status: 'active' };

    var users = {};

    users[alice.user_id] = { status: 'active' };
    users = activity.update_users(users);
    assert.deepEqual(users, [{
        name: 'Alice Smith',
        href: '#narrow/pm-with/1-alice',
        user_id: alice.user_id,
        num_unread: 0,
        type: 'active',
        type_desc: 'is active',
        mobile: undefined,
        bool_buddy: false.toString(),
} ]);

    // Test if user index in presence_info is the expected one
    var all_users = activity._filter_and_sort(activity.presence_info);
    assert.equal(all_users.indexOf(alice.user_id.toString()), 0);

    // Test another user
    users = {};
    users[mark.user_id] = { status: 'active' };
    users = activity.update_users(users);
    assert.deepEqual(users, [{
        name: 'Marky Mark',
        href: '#narrow/pm-with/4-mark',
        user_id: mark.user_id,
        num_unread: 0,
        type: 'active',
        type_desc: 'is active',
        mobile: undefined,
        bool_buddy: false.toString(),
    } ]);

    all_users = activity._filter_and_sort(activity.presence_info);
    assert.equal(all_users.indexOf(mark.user_id.toString()), 1);

}());

(function test_add_user_to_buddy_list() {
    var index = activity.buddy_list.indexOf(mark.user_id);
    assert.equal(index, -1);

    activity.add_user_to_buddy_list(mark.user_id);
    index = activity.buddy_list.indexOf(mark.user_id);
    assert(index !== -1);
}());

(function test_remove_user_from_buddy_list() {
    activity.add_user_to_buddy_list(mark.user_id);

    activity.remove_user_from_buddy_list(mark.user_id);
    var index = activity.buddy_list.indexOf(mark.user_id);
    assert.equal(index, -1);
}());

(function test_initialise_buddy_list() {
    var buddy_list = [alice.user_id, fred.user_id, jill.user_id, mark.user_id];
    activity.initialise_buddy_list(buddy_list);

    console.log(JSON.stringify(activity.buddy_list));
    assert.equal(activity.buddy_list.length, 4);
    var index = activity.buddy_list.indexOf(alice.user_id);
    assert(index > -1);

    index = activity.buddy_list.indexOf(fred.user_id);
    assert(index > -1);

    index = activity.buddy_list.indexOf(jill.user_id);
    assert(index > -1);

    index = activity.buddy_list.indexOf(mark.user_id);
    assert(index > -1);
}());
