var composebox_typeahead = (function () {

//************************************
// AN IMPORTANT NOTE ABOUT TYPEAHEADS
//************************************
// They do not do any HTML escaping, at all.
// And your input to them is rendered as though it were HTML by
// the default highlighter.
//
// So if you are not using trusted input, you MUST use the a
// highlighter that escapes (i.e. one that calls
// typeahead_helper.highlight_with_escaping).

var exports = {};

var seen_topics = new Dict();

exports.add_topic = function (uc_stream, uc_topic) {
    // For Denmark/FooBar, we set
    // seen_topics['denmark']['foobar'] to 'FooBar',
    // where seen_topics is a Dict of Dicts
    var stream = uc_stream.toLowerCase();
    var topic = uc_topic.toLowerCase();

    if (! seen_topics.has(stream)) {
        seen_topics.set(stream, new Dict());
    }
    var topic_dict = seen_topics.get(stream);
    if (! topic_dict.has(topic)) {
        topic_dict.set(topic, uc_topic);
    }
};

exports.topics_seen_for = function (stream) {
    stream = stream.toLowerCase();
    if (seen_topics.has(stream)) {
        return seen_topics.get(stream).values().sort();
    }
    return [];
};

function get_last_recipient_in_pm(query_string) {
    var recipients = util.extract_pm_recipients(query_string);
    return recipients[recipients.length-1];
}

function query_matches_language(query, lang) {
    query = query.toLowerCase();
    return lang.indexOf(query) !== -1;
}

function query_matches_person(query, person) {
    // Case-insensitive.
    query = query.toLowerCase();

    return ( person.email    .toLowerCase().indexOf(query) !== -1
         ||  person.full_name.toLowerCase().indexOf(query) !== -1);
}

function query_matches_stream(query, stream) {
    query = query.toLowerCase();

    return ( stream.name       .toLowerCase().indexOf(query) !== -1
         ||  stream.description.toLowerCase().indexOf(query) !== -1);
}

// Case-insensitive
function query_matches_emoji(query, emoji) {
    // replaces spaces with underscores
    query = query.split(" ").join("_");
    return (emoji.emoji_name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
}

// nextFocus is set on a keydown event to indicate where we should focus on keyup.
// We can't focus at the time of keydown because we need to wait for typeahead.
// And we can't compute where to focus at the time of keyup because only the keydown
// has reliable information about whether it was a tab or a shift+tab.
var nextFocus = false;

function handle_keydown(e) {
    var code = e.keyCode || e.which;

    if (code === 13 || (code === 9 && !e.shiftKey)) { // Enter key or tab key
        if (e.target.id === "stream" || e.target.id === "subject" || e.target.id === "private_message_recipient") {
            // For enter, prevent the form from submitting
            // For tab, prevent the focus from changing again
            e.preventDefault();
        }

        // In the new_message_content box, preventDefault() for tab but not for enter
        if (e.target.id === "new_message_content" && code !== 13) {
            e.preventDefault();
        }

        if (e.target.id === "stream") {
            nextFocus = "subject";
        } else if (e.target.id === "subject") {
            if (code === 13) {
                e.preventDefault();
            }
            nextFocus = "new_message_content";
        } else if (e.target.id === "private_message_recipient") {
            nextFocus = "new_message_content";
        } else if (e.target.id === "new_message_content") {
            if (code === 13) {
                nextFocus = false;
            } else {
                nextFocus = "compose-send-button";
            }
        } else {
            nextFocus = false;
        }

        // If no typeaheads are shown...
        if (!($("#subject").data().typeahead.shown ||
              $("#stream").data().typeahead.shown ||
              $("#private_message_recipient").data().typeahead.shown ||
              $("#new_message_content").data().typeahead.shown)) {

            // If no typeaheads are shown and the user is tabbing from the message content box,
            // then there's no need to wait and we can change the focus right away.
            // Without this code to change the focus right away, if the user presses enter
            // before they fully release the tab key, the tab will be lost.  Note that we don't
            // want to change focus right away in the private_message_recipient box since it
            // takes the typeaheads a little time to open after the user finishes typing, which
            // can lead to the focus moving without the autocomplete having a chance to happen.
            if (nextFocus) {
                ui_util.focus_on(nextFocus);
                nextFocus = false;
            }

            // Send the message on Ctrl/Cmd-Enter or if the user has configured enter to
            // send and the Shift/Ctrl/Cmd/Alt keys are not pressed.
            // Otherwise, make sure to insert a newline instead
            if (e.target.id === "new_message_content" && code === 13) {
                if ((!page_params.enter_sends && (e.metaKey || e.ctrlKey)) ||
                    (page_params.enter_sends && !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey))
                ) {
                    e.preventDefault();
                    if ($("#compose-send-button").attr('disabled') !== "disabled") {
                        $("#compose-send-button").attr('disabled', 'disabled');
                        compose.finish();
                    }
                }
                // Don't prevent default -- just let the enter key go in as usual.
            }
        }
    }
}

function handle_keyup(e) {
    var code = e.keyCode || e.which;
    if (code === 13 || (code === 9 && !e.shiftKey)) { // Enter key or tab key
        if (nextFocus) {
            ui_util.focus_on(nextFocus);
            nextFocus = false;
        }
    }
}

// http://stackoverflow.com/questions/3380458/looking-for-a-better-workaround-to-chrome-select-on-focus-bug
function select_on_focus(field_id) {
    // A select event appears to trigger a focus event under certain
    // conditions in Chrome so we need to protect against infinite
    // recursion.
    var in_handler = false;
    $("#" + field_id).focus(function () {
        if (in_handler) {
            return;
        }
        in_handler = true;
        $("#" + field_id).select().one('mouseup', function (e) {
            e.preventDefault();
        });
        in_handler = false;
    });
}

exports.split_at_cursor = function (query, input) {
    var cursor = input.caret();
    return [query.slice(0, cursor), query.slice(cursor)];
};

exports.tokenize_compose_str = function (s) {
    // This basically finds a token like "@alic" or
    // "#Veron" as close to the end of the string as it
    // can find it.  It wants to find white space or
    // punctuation before the token, unless it's at the
    // beginning of the line.  It doesn't matter what comes
    // after the first character.
    var i = s.length;

    var min_i = s.length - 25;
    if (min_i < 0) {
        min_i = 0;
    }

    while (i > min_i) {
        i -= 1;
        switch (s[i]) {
            case '`':
            case '~':
                // Code block must start on a new line
                if (i === 2) {
                    return s.slice(0);
                } else if (i > 2 && s[i-3] === "\n") {
                    return s.slice(i-2);
                }
                break;
            case '#':
            case '@':
            case ':':
                if (i === 0) {
                    return s.slice(i);
                } else if (/[\s(){}\[\]]/.test(s[i-1])) {
                    return s.slice(i);
                }
        }
    }

    return '';
};

exports.compose_content_begins_typeahead = function (query) {
    var q = exports.split_at_cursor(query, this.$element)[0];

    var current_token = exports.tokenize_compose_str(q);
    if (current_token === '') {
        return false;
    }

    // Start syntax highlighting autocompleter if the first three characters are ```
    var syntax_token = current_token.substring(0,3);
    if (this.options.completions.syntax && (syntax_token === '```' || syntax_token === "~~~")) {
        // Only autocomplete if user starts typing a language after ```
        if (current_token.length === 3) {
            return false;
        }

        // If the only input is a space, don't autocomplete
        current_token = current_token.substring(3);
        if (current_token === " ") {
            return false;
        }

        // Trim the first whitespace if it is there
        if (current_token[0] === " ") {
            current_token = current_token.substring(1);
        }
        this.completing = 'syntax';
        this.token = current_token;
        return Object.keys(pygments_data.langs);
    }

    // Only start the emoji autocompleter if : is directly after one
    // of the whitespace or punctuation chars we split on.
    if (this.options.completions.emoji && current_token[0] === ':') {
        // We don't want to match non-emoji emoticons such
        // as :P or :-p
        // Also, if the user has only typed a colon and nothing after,
        // no need to match yet.
        if (/^:-?.?$/.test(current_token)) {
            return false;
        }
        this.completing = 'emoji';
        this.token = current_token.substring(1);
        return emoji.emojis;
    }

    if (this.options.completions.mention && current_token[0] === '@') {
        current_token = current_token.substring(1);
        if (current_token.length < 1 || current_token.lastIndexOf('*') !== -1) {
            return false;
        }

        this.completing = 'mention';
        this.token = current_token;
        var all_item = {
            special_item_text: "all (Notify everyone)",
            email: "all",
            // Always sort above, under the assumption that names will
            // be longer and only contain "all" as a substring.
            pm_recipient_count: Infinity,
            full_name: "all",
        };
        var everyone_item = {
            special_item_text: "everyone (Notify everyone)",
            email: "everyone",
            pm_recipient_count: Infinity,
            full_name: "everyone",
        };
        var persons = people.get_realm_persons();
        return [].concat(persons, [all_item, everyone_item]);
    }

    if (this.options.completions.stream && current_token[0] === '#') {
        if (current_token.length === 1) {
            return false;
        }

        current_token = current_token.substring(1);

        // Don't autocomplete if there is a space following a '#'
        if (current_token[0] === " ") {
            return false;
        }

        this.completing = 'stream';
        this.token = current_token;
        return stream_data.subscribed_subs();
    }
    return false;
};

exports.content_highlighter = function (item) {
    if (this.completing === 'emoji') {
        return typeahead_helper.render_typeahead_item({
            primary: item.emoji_name.split("_").join(" "),
            img_src: item.emoji_url,
        });
    } else if (this.completing === 'mention') {
        return typeahead_helper.render_person(item);
    } else if (this.completing === 'stream') {
        return typeahead_helper.render_stream(item);
    } else if (this.completing === 'syntax') {
        return typeahead_helper.render_typeahead_item({ primary: item });
    }
};

exports.content_typeahead_selected = function (item) {
    var pieces = exports.split_at_cursor(this.query, this.$element);
    var beginning = pieces[0];
    var rest = pieces[1];
    var textbox = this.$element;

    if (this.completing === 'emoji') {
        // leading and trailing spaces are required for emoji,
        // except if it begins a message or a new line.
        if (beginning.lastIndexOf(":") === 0 ||
            beginning.charAt(beginning.lastIndexOf(":") - 1) === " " ||
            beginning.charAt(beginning.lastIndexOf(":") - 1) === "\n") {
            beginning = (beginning.substring(0, beginning.length - this.token.length - 1)+ ":" + item.emoji_name + ": ");
        } else {
            beginning = (beginning.substring(0, beginning.length - this.token.length - 1) + " :" + item.emoji_name + ": ");
        }
    } else if (this.completing === 'mention') {
        beginning = (beginning.substring(0, beginning.length - this.token.length - 1)
                + '@**' + item.full_name + '** ');
        $(document).trigger('usermention_completed.zulip', {mentioned: item});
    } else if (this.completing === 'stream') {
        beginning = (beginning.substring(0, beginning.length - this.token.length - 1)
                + '#**' + item.name + '** ');
        $(document).trigger('streamname_completed.zulip', {stream: item});
    } else if (this.completing === 'syntax') {
        // Isolate the end index of the triple backticks/tildes, including
        // possibly a space afterward
        var backticks = beginning.length - this.token.length;
        if (rest === '') {
            // If cursor is at end of input ("rest" is empty), then
            // complete the token before the cursor, and add a closing fence
            // after the cursor
            beginning = beginning.substring(0, backticks) + item + '\n';
            rest = "\n" + beginning.substring(backticks - 4, backticks).trim() + rest;
        } else {
            // If more text after the input, then complete the token, but don't touch
            // "rest" (i.e. do not add a closing fence)
            beginning = beginning.substring(0, backticks) + item;
        }
    }

    // Keep the cursor after the newly inserted text, as Bootstrap will call textbox.change() to
    // overwrite the text in the textbox.
    setTimeout(function () {
        textbox.caret(beginning.length, beginning.length);
        // Also, trigger autosize to check if compose box needs to be resized.
        compose_ui.autosize_textarea();
    }, 0);
    return beginning + rest;
};

exports.compose_content_matcher = function (item) {
    if (this.completing === 'emoji') {
        return query_matches_emoji(this.token, item);
    } else if (this.completing === 'mention') {
        return query_matches_person(this.token, item);
    } else if (this.completing === 'stream') {
        return query_matches_stream(this.token, item);
    } else if (this.completing === 'syntax') {
        return query_matches_language(this.token, item);
    }
};

exports.compose_matches_sorter = function (matches) {
    if (this.completing === 'emoji') {
        return typeahead_helper.sort_emojis(matches, this.token);
    } else if (this.completing === 'mention') {
        return typeahead_helper.sort_recipients(matches, this.token,
                                                compose_state.stream_name());
    } else if (this.completing === 'stream') {
        return typeahead_helper.sort_streams(matches, this.token);
    } else if (this.completing === 'syntax') {
        return typeahead_helper.sort_languages(matches, this.token);
    }
};

exports.initialize_compose_typeahead = function (selector, completions) {
    completions = $.extend(
        {mention: false, emoji: false, stream: false, syntax: false}, completions);

    $(selector).typeahead({
        items: 5,
        dropup: true,
        fixed: true,
        source: exports.compose_content_begins_typeahead,
        highlighter: exports.content_highlighter,
        matcher: exports.compose_content_matcher,
        sorter: exports.compose_matches_sorter,
        updater: exports.content_typeahead_selected,
        stopAdvance: true, // Do not advance to the next field on a tab or enter
        completions: completions,
    });
};

exports.initialize = function () {
    select_on_focus("stream");
    select_on_focus("subject");
    select_on_focus("private_message_recipient");

    // These handlers are at the "form" level so that they are called after typeahead
    $("form#send_message_form").keydown(handle_keydown);
    $("form#send_message_form").keyup(handle_keyup);

    $("#enter_sends").click(function () {
        var send_button = $("#compose-send-button");
        page_params.enter_sends = $("#enter_sends").is(":checked");
        if (page_params.enter_sends) {
            send_button.fadeOut();
        } else {
            send_button.fadeIn();
        }

        // Refocus in the content box so you can continue typing or
        // press Enter to send.
        $("#new_message_content").focus();

        return channel.post({
            url: '/json/users/me/enter-sends',
            idempotent: true,
            data: {enter_sends: page_params.enter_sends},
        });
    });
    $("#enter_sends").prop('checked', page_params.enter_sends);
    if (page_params.enter_sends) {
        $("#compose-send-button").hide();
    }

    // limit number of items so the list doesn't fall off the screen
    $( "#stream" ).typeahead({
        source: function () {
            return stream_data.subscribed_streams();
        },
        items: 3,
        fixed: true,
        highlighter: function (item) {
            return typeahead_helper.render_typeahead_item({ primary: item });
        },
        matcher: function (item) {
            // The matcher for "stream" is strictly prefix-based,
            // because we want to avoid mixing up streams.
            var q = this.query.trim().toLowerCase();
            return (item.toLowerCase().indexOf(q) === 0);
        },
    });

    $( "#subject" ).typeahead({
        source: function () {
            var stream_name = $("#stream").val();
            return exports.topics_seen_for(stream_name);
        },
        items: 3,
        fixed: true,
        highlighter: function (item) {
            return typeahead_helper.render_typeahead_item({ primary: item });
        },
        sorter: function (items) {
            var sorted = typeahead_helper.sorter(this.query, items, function (x) {return x;});
            if (sorted.length > 0 && sorted.indexOf(this.query) === -1) {
                sorted.unshift(this.query);
            }
            return sorted;
        },
    });

    $( "#private_message_recipient" ).typeahead({
        source: people.get_all_persons, // This is a function.
        items: 5,
        dropup: true,
        fixed: true,
        highlighter: function (item) {
            return typeahead_helper.render_person(item);
        },
        matcher: function (item) {
            var current_recipient = get_last_recipient_in_pm(this.query);
            // If you type just a comma, there won't be any recipients.
            if (!current_recipient) {
                return false;
            }
            var recipients = util.extract_pm_recipients(this.query);
            if (recipients.indexOf(item.email) > -1) {
                return false;
            }

            return query_matches_person(current_recipient, item);
        },
        sorter: function (matches) {
            // var current_stream = compose_state.stream_name();
            return typeahead_helper.sort_recipientbox_typeahead(
                this.query, matches, "");
        },
        updater: function (item, event) {
            var previous_recipients = typeahead_helper.get_cleaned_pm_recipients(this.query);
            previous_recipients.pop();
            previous_recipients = previous_recipients.join(", ");
            if (previous_recipients.length !== 0) {
                previous_recipients += ", ";
            }
            if (event && event.type === 'click') {
                ui_util.focus_on('private_message_recipient');
            }
            return previous_recipients + item.email + ", ";
        },
        stopAdvance: true, // Do not advance to the next field on a tab or enter
    });

    exports.initialize_compose_typeahead("#new_message_content", {mention: true, emoji: true, stream: true, syntax: true});

    $( "#private_message_recipient" ).blur(function () {
        var val = $(this).val();
        var recipients = typeahead_helper.get_cleaned_pm_recipients(val);
        $(this).val(recipients.join(", "));
    });
};

return exports;

}());
if (typeof module !== 'undefined') {
    module.exports = composebox_typeahead;
}
