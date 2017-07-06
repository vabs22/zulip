var bot_data = (function () {
    var exports = {};

    var bots = {};
    var bot_fields = ['api_key', 'avatar_url', 'default_all_public_streams',
                      'default_events_register_stream', 'default_sending_stream',
                      'email', 'full_name', 'is_active', 'owner', 'bot_type'];

    var bot_services = {};
    var services_fields = ['base_url', 'interface', 'name'];

    var send_change_event = _.debounce(function () {
        $(document).trigger('zulip.bot_data_changed');
    }, 50);

    var set_can_admin = function bot_data__set_can_admin(bot) {
        if (page_params.is_admin) {
            bot.can_admin = true;
        } else if (bot.owner !== undefined && people.is_current_user(bot.owner)) {
            bot.can_admin = true;
        } else {
            bot.can_admin = false;
        }
    };

    exports.add = function bot_data__add(bot) {
        var clean_bot = _.pick(bot, bot_fields);
        bots[bot.email] = clean_bot;
        set_can_admin(clean_bot);
        send_change_event();
    };

    exports.add_bot_services = function bot_data__add_bot_services(bot_services) {
        _.each(bot_services, function (bot_service) {
            exports.add_bot_service(bot_service);
        });
    };

    exports.add_bot_service = function bot_data__add_bot_service(bot_service) {
        var clean_bot_service = _.pick(bot_service, services_fields);
        bot_services[bot_service.email] = clean_bot_service;
        send_change_event();
    };

    exports.deactivate = function bot_data__deactivate(email) {
        bots[email].is_active = false;
        send_change_event();
    };

    exports.update = function bot_data__update(email, bot_update) {
        var bot = bots[email];
        _.extend(bot, _.pick(bot_update, bot_fields));
        set_can_admin(bot);
        send_change_event();
    };

    exports.update_bot_service = function bot_data__update_bot_service(email, bot_service_update) {
        var bot_service = bot_services[email];
        _.extend(bot_service, _.pick(bot_service_update, services_fields));
        send_change_event();
    };

    exports.get_all_bots_for_current_user = function bots_data__get_editable() {
        return _.filter(bots, function (bot) {
            return people.is_current_user(bot.owner);
        });
    };

    exports.get_editable = function bots_data__get_editable() {
        return _.filter(bots, function (bot) {
            return bot.is_active && people.is_current_user(bot.owner);
        });
    };

    exports.get = function bot_data__get(email) {
        return bots[email];
    };

    exports.get_bot_service = function bot_data__get_bot_service(email) {
        return bot_services[email];
    };

    exports.initialize = function () {
        _.each(page_params.realm_bots, function (bot) {
            exports.add(bot);
        });
        exports.add_bot_services(page_params.realm_bots_services);
    };

    return exports;
}());
if (typeof module !== 'undefined') {
    module.exports = bot_data;
}
