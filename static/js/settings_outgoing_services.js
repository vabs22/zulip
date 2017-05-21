var settings_outgoing_services = (function () {

var exports = {};

function add_service_row(service) {
    service.id_suffix = _.uniqueId('_service_');
    console.log("13");
    var row = $(templates.render('bot_avatar_row', service));
    console.log(JSON.stringify(row));
    console.log(JSON.stringify(service));
    if (service.is_active) {
        $('#active_services_list').append(row);
    } else {
        $('#inactive_services_list').append(row);
    }
}

function is_local_part(value, element) {
    // Adapted from Django's EmailValidator
    return this.optional(element) || /^[\-!#$%&'*+\/=?\^_`{}|~0-9A-Z]+(\.[\-!#$%&'*+\/=?\^_`{}|~0-9A-Z]+)*$/i.test(value);
}

function render_services() {
    $('#active_bots_list').empty();
    $('#inactive_bots_list').empty();

    _.each(service_data.get_all_bots_for_current_user(), function (service) {
        add_service_row({
            name: service.name,
            bot_email: service.user_profile.email,
            avatar_url: service.user_profile.avatar_url,
            base_url: service.base_url,
            token: service.token,
            is_active: service.is_active,
            interface: service.interface
        });
    });

    if ($("#bots_lists_navbar .active-bots-tab").hasClass("active")) {
        $("#active_bots_list").show();
        $("#inactive_bots_list").hide();
    } else {
        $("#active_bots_list").hide();
        $("#inactive_bots_list").show();
    }
}

exports.set_up = function () {
    $("#api_key_value").text("");
    $("#get_api_key_box").hide();
    $("#show_api_key_box").hide();
    $("#api_key_button_box").show();

    $('#api_key_button').click(function () {
        if (page_params.realm_password_auth_enabled !== false) {
            $("#get_api_key_box").show();
        } else {
            // Skip the password prompt step
            $("#get_api_key_box form").submit();
        }
        $("#api_key_button_box").hide();
    });

    $("#get_api_key_box").hide();
    $("#show_api_key_box").hide();
    $("#get_api_key_box form").ajaxForm({
        dataType: 'json', // This seems to be ignored. We still get back an xhr.
        success: function (resp, statusText, xhr) {
            var result = JSON.parse(xhr.responseText);
            var settings_status = $('#account-settings-status').expectOne();

            $("#get_api_key_password").val("");
            $("#api_key_value").text(result.api_key);
            $("#show_api_key_box").show();
            $("#get_api_key_box").hide();
            settings_status.hide();
        },
        error: function (xhr) {
            ui_report.error(i18n.t("Error getting API key"), xhr, $('#account-settings-status').expectOne());
            $("#show_api_key_box").hide();
            $("#get_api_key_box").show();
        },
    });

    // TODO: render bots xxxx
    // render_services();
    $(document).on('zulip.service_data_changed', render_services);

    $.validator.addMethod("bot_local_part",
                          function (value, element) {
                              return is_local_part.call(this, value + "-bot", element);
                          },
                          "Please only use characters that are valid in an email address");


    var create_avatar_widget = avatar.build_bot_create_widget();

    $('#create_service_form').validate({
        errorClass: 'text-error',
        success: function () {
            $('#service_table_error').hide();
        },
        submitHandler: function () {
            // var full_name = $('#create_bot_name').val();
            // var short_name = $('#create_bot_short_name').val() || $('#create_bot_short_name').text();
            // var formData = new FormData();
            //
            // formData.append('csrfmiddlewaretoken', csrf_token);
            // formData.append('full_name', full_name);
            // formData.append('short_name', short_name);
            // jQuery.each($('#bot_avatar_file_input')[0].files, function (i, file) {
            //     formData.append('file-'+i, file);
            // });
            // $('#create_bot_button').val('Adding bot...').prop('disabled', true);
            // channel.post({
            //     url: '/json/services',
            //     data: formData,
            //     cache: false,
            //     processData: false,
            //     contentType: false,
            //     success: function () {
            //         $('#bot_table_error').hide();
            //         $('#create_bot_name').val('');
            //         $('#create_bot_short_name').val('');
            //         $('#create_bot_button').show();
            //         create_avatar_widget.clear();
            //     },
            //     error: function (xhr) {
            //         $('#bot_table_error').text(JSON.parse(xhr.responseText).msg).show();
            //     },
            //     complete: function () {
            //         $('#create_bot_button').val('Create bot').prop('disabled', false);
            //     },
            // });
            // add_service_row({
            //     name: $('#create_service_name').val(),
            //     bot_email: "",
            //     avatar_url: "",
            //     base_url: $('#create_service_base_url').val(),
            //     token: "",
            //     is_active: true,
            //     interface: $('#create_service_interface').val()
            // });

            add_service_row({
                name: $('#create_service_name').val(),
                api_key: "",
                avatar_url: "",
                email: $('#create_service_base_url').val(),
                token: "",
                is_active: true,
                interface: $('#create_service_interface').val(),
                zuliprc: 'zuliprc', // Most browsers do not allow filename starting with `.`
            });
        },
    });

    $("#active_bots_list").on("click", "button.delete_bot", function (e) {
        var email = $(e.currentTarget).data('email');
        channel.del({
            url: '/json/bots/' + encodeURIComponent(email),
            success: function () {
                var row = $(e.currentTarget).closest("li");
                row.hide('slow', function () { row.remove(); });
            },
            error: function (xhr) {
                $('#bot_delete_error').text(JSON.parse(xhr.responseText).msg).show();
            },
        });
    });

    $("#inactive_bots_list").on("click", "button.reactivate_bot", function (e) {
        var email = $(e.currentTarget).data('email');

        channel.post({
            url: '/json/users/' + encodeURIComponent(email) + "/reactivate",
            error: function (xhr) {
                $('#bot_delete_error').text(JSON.parse(xhr.responseText).msg).show();
            },
        });
    });

    // $("#active_bots_list").on("click", "button.regenerate_bot_api_key", function (e) {
    //     var email = $(e.currentTarget).data('email');
    //     channel.post({
    //         url: '/json/bots/' + encodeURIComponent(email) + '/api_key/regenerate',
    //         idempotent: true,
    //         success: function (data) {
    //             var row = $(e.currentTarget).closest("li");
    //             row.find(".api_key").find(".value").text(data.api_key);
    //             row.find("api_key_error").hide();
    //         },
    //         error: function (xhr) {
    //             var row = $(e.currentTarget).closest("li");
    //             row.find(".api_key_error").text(JSON.parse(xhr.responseText).msg).show();
    //         },
    //     });
    // });

    var image_version = 0;

    var avatar_widget = avatar.build_bot_edit_widget($("#settings_page"));

    $("#active_bots_list").on("click", "button.open_edit_bot_form", function (e) {
        var users_list = people.get_realm_persons().filter(function (person)  {
            return !person.is_bot;
        });
        var li = $(e.currentTarget).closest('li');
        var edit_div = li.find('div.edit_bot');
        var form = $('#settings_page .edit_bot_form');
        var image = li.find(".image");
        var bot_info = li;
        var reset_edit_bot = li.find(".reset_edit_bot");
        var owner_select = $(templates.render("bot_owner_select", {users_list:users_list}));
        var old_full_name = bot_info.find(".name").text();
        var old_owner = bot_data.get(bot_info.find(".email .value").text()).owner;
        var bot_email = bot_info.find(".email .value").text();

        $("#settings_page .edit_bot .edit_bot_name").val(old_full_name);
        $("#settings_page .edit_bot .select-form").text("").append(owner_select);
        $("#settings_page .edit_bot .edit-bot-owner select").val(old_owner);
        $("#settings_page .edit_bot_form").attr("data-email", bot_email);
        $(".edit_bot_email").text(bot_email);

        avatar_widget.clear();


        function show_row_again() {
            image.show();
            bot_info.show();
            edit_div.hide();
        }

        reset_edit_bot.click(function (event) {
            form.find(".edit_bot_name").val(old_full_name);
            owner_select.remove();
            show_row_again();
            $(this).off(event);
        });

        var errors = form.find('.bot_edit_errors');

        form.validate({
            errorClass: 'text-error',
            success: function () {
                errors.hide();
            },
            submitHandler: function () {
                var email = form.attr('data-email');
                var full_name = form.find('.edit_bot_name').val();
                var bot_owner = form.find('.edit-bot-owner select').val();
                var file_input = $(".edit_bot").find('.edit_bot_avatar_file_input');
                var spinner = form.find('.edit_bot_spinner');
                var edit_button = form.find('.edit_bot_button');
                var formData = new FormData();

                formData.append('csrfmiddlewaretoken', csrf_token);
                formData.append('full_name', full_name);
                formData.append('bot_owner', bot_owner);
                jQuery.each(file_input[0].files, function (i, file) {
                    formData.append('file-'+i, file);
                });
                loading.make_indicator(spinner, {text: 'Editing bot'});
                edit_button.hide();
                channel.patch({
                    url: '/json/bots/' + encodeURIComponent(email),
                    data: formData,
                    cache: false,
                    processData: false,
                    contentType: false,
                    success: function (data) {
                        loading.destroy_indicator(spinner);
                        errors.hide();
                        edit_button.show();
                        show_row_again();
                        avatar_widget.clear();

                        bot_info.find('.name').text(full_name);
                        if (data.avatar_url) {
                            // Note that the avatar_url won't actually change on the back end
                            // when the user had a previous uploaded avatar.  Only the content
                            // changes, so we version it to get an uncached copy.
                            image_version += 1;
                            image.find('img').attr('src', data.avatar_url+'&v='+image_version.toString());
                        }
                    },
                    error: function (xhr) {
                        loading.destroy_indicator(spinner);
                        edit_button.show();
                        errors.text(JSON.parse(xhr.responseText).msg).show();
                    },
                });
            },
        });


    });

    $("#bots_lists_navbar .active-bots-tab").click(function (e) {
        e.preventDefault();
        e.stopPropagation();

        $("#bots_lists_navbar .active-bots-tab").addClass("active");
        $("#bots_lists_navbar .inactive-bots-tab").removeClass("active");
        $("#active_bots_list").show();
        $("#inactive_bots_list").hide();
    });

    $("#bots_lists_navbar .inactive-bots-tab").click(function (e) {
        e.preventDefault();
        e.stopPropagation();

        $("#bots_lists_navbar .active-bots-tab").removeClass("active");
        $("#bots_lists_navbar .inactive-bots-tab").addClass("active");
        $("#active_bots_list").hide();
        $("#inactive_bots_list").show();
    });

};

return exports;
}());

if (typeof module !== 'undefined') {
    module.exports = settings_outgoing_services;
}
