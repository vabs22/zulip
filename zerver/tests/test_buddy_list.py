# -*- coding: utf-8 -*-
from __future__ import absolute_import
from __future__ import print_function

from zerver.lib.test_classes import (
    ZulipTestCase,
)

from zerver.models import (
    get_user_profile_by_email,
)

import ujson

class BuddyListUpdateTest(ZulipTestCase):
    def test_update_buddy_list(self):
        # type: () -> None
        user_email = "hamlet@zulip.com"
        buddy_email = "iago@zulip.com"

        self.login(user_email)
        user_profile = get_user_profile_by_email(user_email)
        buddy_profile = get_user_profile_by_email(buddy_email)

        result = self.client_patch("/json/users/me/buddy", {
            'user_id': ujson.dumps(str(user_profile.id)),
            'buddy_id': ujson.dumps(str(buddy_profile.id)),
            'should_add': ujson.dumps(str(True)),
        })
        self.assert_json_success(result)

        result = self.client_patch("/json/users/me/buddy", {
            'user_id': ujson.dumps(str(user_profile.id)),
            'buddy_id': ujson.dumps(str(buddy_profile.id)),
            'should_add': ujson.dumps(str(False)),
        })
        self.assert_json_success(result)
