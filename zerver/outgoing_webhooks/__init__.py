from __future__ import absolute_import
from typing import Any, Dict, Text

from zerver.models import GENERIC_INTERFACE, Service, ZULIP_BOT_SERVER_INTERFACE, SLACK_INTERFACE
from zerver.outgoing_webhooks.generic import GenericOutgoingWebhookService
from zerver.outgoing_webhooks.zulip_bot_server import ZulipBotService
from zerver.outgoing_webhooks.slack import SlackOutgoingWebhookService

AVAILABLE_OUTGOING_WEBHOOK_INTERFACES = {
    GENERIC_INTERFACE: GenericOutgoingWebhookService,
    ZULIP_BOT_SERVER_INTERFACE: ZulipBotService,
    SLACK_INTERFACE: SlackOutgoingWebhookService,
}   # type: Dict[Text, Any]

def get_service_interface_class(interface):
    # type: (Text) -> Any
    if interface is None or interface not in AVAILABLE_OUTGOING_WEBHOOK_INTERFACES:
        return AVAILABLE_OUTGOING_WEBHOOK_INTERFACES[GENERIC_INTERFACE]
    else:
        return AVAILABLE_OUTGOING_WEBHOOK_INTERFACES[interface]

def get_outgoing_webhook_service_handler(service):
    # type: (Service) -> Any

    service_interface_class = get_service_interface_class(service.interface_name())
    service_interface = service_interface_class(base_url=service.base_url,
                                                token=service.token,
                                                user_profile=service.user_profile,
                                                service_name=service.name)
    return service_interface
