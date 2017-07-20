from __future__ import absolute_import
from typing import Any, Iterable, Dict, Tuple, Callable, Text, Mapping, Optional

import requests
import json
import sys
import inspect
import logging
import re
from six.moves import urllib
from functools import reduce
from requests import Response

from django.utils.translation import ugettext as _

from zerver.models import Realm, UserProfile, get_realm_by_email_domain, get_user_profile_by_id, get_client
from zerver.lib.actions import check_send_message
from zerver.lib.queue import queue_json_publish
from zerver.lib.validator import check_dict, check_string
from zerver.decorator import JsonableError

MAX_REQUEST_RETRIES = 3

class OutgoingWebhookServiceInterface(object):

    def __init__(self, base_url, token, user_profile, service_name):
        # type: (Text, Text, UserProfile, Text) -> None
        self.base_url = base_url  # type: Text
        self.token = token  # type: Text
        self.user_profile = user_profile  # type: Text
        self.service_name = service_name  # type: Text

    # Given an event that triggers an outgoing webhook operation, returns the REST
    # operation that should be performed, together with the body of the request.
    #
    # The input format can vary depending on the type of webhook service.
    # The return value should be a tuple (rest_operation, request_data), where:
    # rest_operation is a dictionary containing atleast the following keys: method, relative_url_path and
    # request_kwargs. It provides rest operation related info.
    # request_data is the data to be sent to third party service.
    # It should be in the appropriate form. Ex: certain services require the post data to be in
    # json form. Hence request_data returned here should be a json.
    def process_event(self, event):
        # type: (Dict[str, Any]) -> Tuple[Dict[str, Any], Any]
        raise NotImplementedError()

    # Given a successful response to the outgoing webhook REST operation, determines if response is required
    # to be sent to user and in such case, returns the message that should be sent back.
    #
    # The response will be the response object obtained from REST operation.
    # The event will be the same as the input to process_command.
    # It returns the message to be sent back to user. If None is returned back, no response is sent back.
    def process_success(self, response, event):
        # type: (Response, Dict[Text, Any]) -> Optional[str]
        raise NotImplementedError()

    # Given a failed outgoing webhook REST operation, determines if response is required
    # to be sent to user and in such case, returns the message that should be sent back.
    #
    # The response will be the response object obtained from REST operation.
    # The event will be the same as the input to process_command.
    # It returns the message to be sent back to user. If None is returned back, no response is sent back.
    def process_failure(self, response, event):
        # type: (Response, Dict[Text, Any]) -> Optional[str]
        raise NotImplementedError()

    # Make a message more readable by refactoring @-mentions in a string. Example: it replaces
    # @**vabs22 user** to @vabs22 user in the string.
    # It can be used to refactor the data to be sent to third party services by outgoing webhooks. Zulip's
    # current @-mention annotation (i.e. @**_**) can be somewhat confusing for third party services,
    # hence it can be used to make it more readable.
    # Note: don't use it to refactor the content of message dict() data to be sent to zulip bot server,
    # as some bots are based on @-mention trigger (Example: xkcd bot).
    # For mentions containing multiple words, like @**Hamlet User**, it refactors them to @Hamlet User.
    # The interface classes can also overwrite this function to create their own implementation.
    def make_message_content_readable(self, message_content):
        # type: (Text) -> Text

        def replace_match(match):
            # type: (Any) -> Text
            match = match.group()
            match = "@" + match[3:-2]
            return match

        message_content = re.sub(r'@\*\*\w+(\s\w+)?\*\*', replace_match, message_content)
        return message_content

def send_response_message(bot_id, message, response_message_content):
    # type: (str, Dict[str, Any], Text) -> None
    recipient_type_name = message['type']
    bot_user = get_user_profile_by_id(bot_id)
    realm = get_realm_by_email_domain(message['sender_email'])

    if recipient_type_name == 'stream':
        recipients = [message['display_recipient']]
        check_send_message(bot_user, get_client("OutgoingWebhookResponse"), recipient_type_name, recipients,
                           message['subject'], response_message_content, realm, forwarder_user_profile=bot_user)
    else:
        # Private message; only send if the bot is there in the recipients
        recipients = [recipient['email'] for recipient in message['display_recipient']]
        if bot_user.email in recipients:
            check_send_message(bot_user, get_client("OutgoingWebhookResponse"), recipient_type_name, recipients,
                               message['subject'], response_message_content, realm, forwarder_user_profile=bot_user)

def succeed_with_message(event, success_message):
    # type: (Dict[str, Any], Text) -> None
    if success_message is None:
        return
    success_message = "Success! " + success_message
    send_response_message(event['user_profile_id'], event['message'], success_message)

def fail_with_message(event, failure_message):
    # type: (Dict[str, Any], Text) -> None
    if failure_message is None:
        return
    failure_message = "Failure! " + failure_message
    send_response_message(event['user_profile_id'], event['message'], failure_message)

def request_retry(event, failure_message):
    # type: (Dict[str, Any], Text) -> None
    event['failed_tries'] += 1
    if event['failed_tries'] > MAX_REQUEST_RETRIES:
        bot_user = get_user_profile_by_id(event['user_profile_id'])
        failure_message = "Maximum retries exceeded! " + failure_message
        fail_with_message(event, failure_message)
        logging.warning("Maximum retries exceeded for trigger:%s event:%s" % (bot_user.email, event['command']))
    else:
        queue_json_publish("outgoing_webhooks", event, lambda x: None)

def do_rest_call(rest_operation, request_data, event, service_handler, timeout=None):
    # type: (Dict[str, Any], Dict[str, Any], Dict[str, Any], Any, Any) -> None
    rest_operation_validator = check_dict([
        ('method', check_string),
        ('relative_url_path', check_string),
        ('request_kwargs', check_dict([])),
        ('base_url', check_string),
    ])

    error = rest_operation_validator('rest_operation', rest_operation)
    if error:
        raise JsonableError(error)

    http_method = rest_operation['method']
    final_url = urllib.parse.urljoin(rest_operation['base_url'], rest_operation['relative_url_path'])
    request_kwargs = rest_operation['request_kwargs']
    request_kwargs['timeout'] = timeout

    try:
        response = requests.request(http_method, final_url, data=request_data, **request_kwargs)
        if str(response.status_code).startswith('2'):
            response_message = service_handler.process_success(response, event)
            succeed_with_message(event, response_message)

        # On 50x errors, try retry
        elif str(response.status_code).startswith('5'):
            request_retry(event, "Internal Server error at third party.")
        else:
            response_message = service_handler.process_failure(response, event)
            fail_with_message(event, response_message)

    except requests.exceptions.Timeout:
        logging.info("Trigger event %s on %s timed out. Retrying" % (event["command"], event['service_name']))
        request_retry(event, 'Unable to connect with the third party.')

    except requests.exceptions.RequestException as e:
        response_message = "An exception occured for message `%s`! See the logs for more information." % (event["command"],)
        logging.exception("Outhook trigger failed:\n %s" % (e,))
        fail_with_message(event, response_message)
