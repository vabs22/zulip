from __future__ import absolute_import
from flask import Flask, request, jsonify
import os
import sys
import json
from typing import Any, Dict, Mapping, Union, List
from werkzeug.exceptions import BadRequest
from six.moves.configparser import SafeConfigParser
import optparse

source_file_dir = os.path.dirname(os.path.abspath(__file__))

from api.zulip import Client
from api.bots_api.run import get_lib_module
from api.bots_api.bot_lib import BotHandlerApi, StateHandler

bots_config = {}  # type: Dict[str, Mapping[str, str]]
available_bots = []  # type: List[str]
bots_lib_module = {}  # type: Dict[str, Any]

def read_config_file(config_file_path):
    # type: (str) -> None
    parser = SafeConfigParser()
    parser.read(config_file_path)

    for section in parser.sections():
        bots_config[section] = {
            "email": parser.get(section, 'email'),
            "key": parser.get(section, 'key'),
            "site": parser.get(section, 'site'),
        }

def load_lib_modules():
    # type: () -> None
    for bot in available_bots:
        path = source_file_dir + "/bots/" + str(bot) + "/" + str(bot) + ".py"
        try:
            bots_lib_module[bot] = get_lib_module(path)
        except Exception:
            print("\n ERROR: Bot \"{}\" doesn't exists. Please make sure you have set up the flaskbotrc "
                  "file correctly.\n").format(bot)
            sys.exit(1)

app = Flask(__name__)

@app.route('/bots/<bot>', methods=['POST'])
def handle_bot(bot):
    # type: (str) -> Union[str, BadRequest]
    if bot not in available_bots:
        return BadRequest("requested bot service {} not supported".format(bot))

    client = Client(email=bots_config[bot]["email"],
                    api_key=bots_config[bot]["key"],
                    site=bots_config[bot]["site"])
    try:
        restricted_client = BotHandlerApi(client)
    except SystemExit:
        return BadRequest("Cannot fetch user profile for bot {}, make sure you have set up the flaskbotrc "
                          "file correctly.".format(bot))
    message_handler = bots_lib_module[bot].handler_class()

    # TODO: Handle stateful bots properly.
    state_handler = StateHandler()

    event = json.loads(request.data)
    message_handler.handle_message(message=event["message"],
                                   client=restricted_client,
                                   state_handler=state_handler)
    return "Success!"

if __name__ == "__main__":
    usage = '''
            zulip-bot-server <path to flaskbotrc>
            Example: zulip-bot-server ~/flaskbotrc
            (This program loads the bot configurations from the
            config file (flaskbotrc here) and loads the bot modules.
            It then starts the server and fetches the requests to the
            above loaded modules and returns the success/failure result)
            Please make sure you have a current flaskbotrc file with the
            configurations of the required bots.
            See lib/readme.md for more context.
            '''

    parser = optparse.OptionParser(usage=usage)
    parser.add_option('--config-file',
                      action='store',
                      help='(config file for the zulip bot server (flaskbotrc))')
    (options, args) = parser.parse_args()

    read_config_file(options.config_file)
    available_bots = list(bots_config.keys())
    load_lib_modules()

    app.run(host="127.0.0.1", port=5002, debug=True)
