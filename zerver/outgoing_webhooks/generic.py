from __future__ import absolute_import
from typing import Any, Dict, Text, Tuple, Callable, Mapping, Optional
import json
from requests import Response
from zerver.models import UserProfile

from zerver.lib.outgoing_webhook import OutgoingWebhookServiceInterface

class GenericOutgoingWebhookService(OutgoingWebhookServiceInterface):

    def __init__(self, base_url, token, user_profile, service_name):
        # type: (Text, Text, UserProfile, Text) -> None
        super(GenericOutgoingWebhookService, self).__init__(base_url, token, user_profile, service_name)

    def process_event(self, event):
        # type: (Dict[str, Any]) -> Tuple[Dict[str, Any], Any]
        rest_operation = {'method': 'POST',
                          'relative_url_path': '',
                          'base_url': event['base_url'],
                          'request_kwargs': {}}
        request_data = {"data": self.make_message_content_readable(event['command']),
                        "message": event['message'],
                        "token": event['token']}
        return rest_operation, json.dumps(request_data)

    def process_success(self, response, event):
        # type: (Response, Dict[Text, Any]) -> Optional[str]
        return str(response.text)

    def process_failure(self, response, event):
        # type: (Response, Dict[Text, Any]) -> Optional[str]
        return str(response.text)
