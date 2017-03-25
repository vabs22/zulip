# -*- coding: utf-8 -*-
from __future__ import absolute_import
from __future__ import print_function

import mock
from typing import Any, Union, Text, List, Mapping, Callable

from zerver.lib.outgoing_webhook import (
    do_rest_call,
    get_outgoing_webhook_service_handler,
    ServiceMessageActions,
)
from zerver.lib.actions import check_send_message
from zerver.lib.test_helpers import get_user_profile_by_email
from zerver.lib.test_classes import ZulipTestCase
from zerver.models import Services, Recipient, Client, UserProfile, get_realm, Subscription
from zerver.outgoing_webhooks import (
    GENERIC_INTERFACE,
    AVAILABLE_OUTGOING_WEBHOOK_INTERFACES,
    get_service_interface_class,
)

import requests
import six

service = Services.objects.create(service_name="test",
                                  base_url="http://requestb.in/18av3gx1",
                                  service_api_key="somerandomkey",
                                  user_profile=get_user_profile_by_email('notification-bot@zulip.com'),
                                  interface=GENERIC_INTERFACE)
service_handler = get_outgoing_webhook_service_handler(service)

rest_operation = {'method': "GET",
                  'relative_url_path': "",
                  'request_kwargs': {}}

class ResponseMock(object):
    def __init__(self, status_code, data):
        # type: (int, Any) -> None
        self.status_code = status_code
        self.data = data

    def json(self):
        # type: () -> str
        return self.data


def request_exception_error(http_method, final_url, data, **request_kwargs):
    # type: (Any, Any, Any, Any) -> Any
    raise requests.exceptions.RequestException

def timeout_error(http_method, final_url, data, **request_kwargs):
    # type: (Any, Any, Any, Any) -> Any
    raise requests.exceptions.Timeout

class DoRestCallTests(ZulipTestCase):
    @mock.patch('zerver.lib.outgoing_webhook.ServiceMessageActions.succeed_with_message')
    def test_successful_request(self, mock_succeed_with_message):
        # type: (mock.Mock) -> None
        response = ResponseMock(200, {"message": "testing"})
        with mock.patch('requests.request', return_value=response):
            result, message = do_rest_call(service_handler, rest_operation, None)
            self.assertEqual(result, mock_succeed_with_message)

    @mock.patch('zerver.lib.outgoing_webhook.ServiceMessageActions.request_retry')
    def test_retry_request(self, mock_request_retry):
        # type: (mock.Mock) -> None
        response = ResponseMock(500, {"message": "testing"})
        with mock.patch('requests.request', return_value=response):
            result, message = do_rest_call(service_handler, rest_operation, None)
            self.assertEqual(result, mock_request_retry)

    @mock.patch('zerver.lib.outgoing_webhook.ServiceMessageActions.fail_with_message')
    def test_fail_request(self, mock_fail_with_message):
        # type: (mock.Mock) -> None
        response = ResponseMock(400, {"message": "testing"})
        with mock.patch('requests.request', return_value=response):
            result, message = do_rest_call(service_handler, rest_operation, None)
            self.assertEqual(result, mock_fail_with_message)

    @mock.patch('logging.info')
    @mock.patch('requests.request', side_effect=timeout_error)
    @mock.patch('zerver.lib.outgoing_webhook.ServiceMessageActions.request_retry')
    def test_timeout_request(self, mock_request_retry, mock_requests_request, mock_logger):
        # type: (mock.Mock, mock.Mock, mock.Mock) -> None
        result, message = do_rest_call(service_handler, rest_operation, {"command": ""})
        self.assertEqual(result, mock_request_retry)

    @mock.patch('logging.exception')
    @mock.patch('requests.request', side_effect=request_exception_error)
    @mock.patch('zerver.lib.outgoing_webhook.ServiceMessageActions.fail_with_message')
    def test_request_exception(self, mock_fail_with_message, mock_requests_request, mock_logger):
        # type: (mock.Mock, mock.Mock, mock.Mock) -> None
        result, message = do_rest_call(service_handler, rest_operation, {"command": ""})
        self.assertEqual(result, mock_fail_with_message)

class OutgoingWebhookServiceHandlerTests(ZulipTestCase):

    def test_service_handler_provider(self):
        # type: () -> None
        service.interface = GENERIC_INTERFACE

        generic_interface_class = get_service_interface_class(GENERIC_INTERFACE)
        generic_interface = generic_interface_class(base_url=service.base_url,
                                                    service_api_key=service.service_api_key,
                                                    bot_email = service.user_profile.email,
                                                    service_name = service.service_name)

        service_handler = get_outgoing_webhook_service_handler(service)
        self.assertEqual(service_handler.base_url, generic_interface.base_url)
        self.assertEqual(service_handler.service_api_key, generic_interface.service_api_key)
        self.assertEqual(service_handler.bot_email, generic_interface.bot_email)
        self.assertEqual(service_handler.service_name, generic_interface.service_name)

        AVAILABLE_OUTGOING_WEBHOOK_INTERFACES.pop(u'test', None)
        service.interface = u'test'
        service_handler = get_outgoing_webhook_service_handler(service)
        self.assertEqual(service_handler.base_url, generic_interface.base_url)
        self.assertEqual(service_handler.service_api_key, generic_interface.service_api_key)
        self.assertEqual(service_handler.bot_email, generic_interface.bot_email)
        self.assertEqual(service_handler.service_name, generic_interface.service_name)


class PersonalMessageTriggersTest(ZulipTestCase):

    @classmethod
    def setUpClass(self):
        # type: () -> None
        self.bot_user = UserProfile.objects.create(full_name='The Test Bot',
                                                   short_name='bot',
                                                   email="testvabs-bot@zulip.com",
                                                   is_bot=True,
                                                   bot_type=UserProfile.OUTGOING_WEBHOOK_BOT,
                                                   is_active=True,
                                                   pointer=1,
                                                   realm=get_realm("zulip"))

        self.recipient = Recipient.objects.create(type=Recipient.PERSONAL,
                                                  type_id=self.bot_user.id)

        self.subscription = Subscription.objects.create(recipient=self.recipient,
                                                        user_profile=self.bot_user,
                                                        active=True)

    @classmethod
    def tearDownClass(self):
        # type: () -> None
        self.bot_user.delete()
        self.recipient.delete()
        self.subscription.delete()

    def test_trigger_on_stream_message(self):
        # type: () -> None
        sender_email = "othello@zulip.com"
        recipients = "Denmark"
        message_type = Recipient.STREAM
        with mock.patch('zerver.lib.actions.queue_json_publish') as queue_json_publish:
            self.send_message(sender_email, recipients, message_type)
            self.assertFalse(queue_json_publish.called)

    def test_trigger_on_private_message_by_bot(self):
        # type: () -> None
        sender_email = "testvabs-bot@zulip.com"
        recipients = "othello@zulip.com"
        message_type = Recipient.PERSONAL

        with mock.patch('zerver.lib.actions.queue_json_publish') as queue_json_publish:
            self.send_message(sender_email, recipients, message_type)
            self.assertFalse(queue_json_publish.called)

    @mock.patch('zerver.lib.actions.queue_json_publish')
    def test_trigger_on_private_message_by_user(self, mock_queue_json_publish):
        # type: (mock.Mock) -> None
        sender_email = "othello@zulip.com"
        recipients = "testvabs-bot@zulip.com"
        message_type = Recipient.PERSONAL

        def check_values_passed(queue_name, trigger_event, x):
            # type: (Any, Union[Mapping[Any, Any], Any], Callable[[Any], None]) -> None
            self.assertEqual(queue_name, "outgoing_webhooks")
            self.assertEqual(trigger_event['bot_email'], recipients)
            self.assertEqual(trigger_event["command"], "test")
            self.assertEqual(trigger_event["retry"], 0)
            self.assertEqual(trigger_event["service_name"], None)
            self.assertEqual(trigger_event["message"]["sender_email"], sender_email)
            self.assertEqual(trigger_event["message"]["type"], self.recipient.type_name())
            self.assertEqual(trigger_event["message"]["sender_realm_str"], self.bot_user.realm.string_id)
            self.assertEqual(trigger_event["message"]["recipient"][0]["email"], recipients)

        mock_queue_json_publish.side_effect = check_values_passed
        self.send_message(sender_email, recipients, message_type, subject='', content='test')
        self.assertTrue(mock_queue_json_publish.called)
