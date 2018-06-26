# hubot-rocketchat-notify

[![NPM version][npm-image]][npm-url]

Hubot script to segment user audience and send direct messages to Rocket.Chat users.

## Installation

In hubot project repo, run:

`npm install hubot-rocketchat-notify --save`

Then add **hubot-rocketchat-notify** to your `external-scripts.json`:

```json
["hubot-rocketchat-notify"]
```

## Configuration


## Sample Interaction

### Immediate send

Use announcement level (e.g. ALERT) to send immediately.

`user1>> hubot ALERT Don't eat the blue cupcakes!`

Sends to all users (including user1)...

```
hubot>> Don't eat the blue cupcakes!
        ALERT sent by @user1
```

### Dialog send

Use NEW (optionally with level) to [start dialog](https://github.com/lmarkus/hubot-conversation) to produce announcements.

This method intended to handle more complicated announcements in roadmap, e.g. scheduling and user group targets.

```
user1>> hubot NEW
hubot>> @admin OK, I'll create a NOTICE from your next message.
        Reply with the message you'd like to send (or `cancel` within 30 seconds).
user1>> Don't eat the blue cupcakes!
```

Sends to all users...

```
hubot>> Don't eat the blue cupcakes!
        NOTICE sent by @user1
```

With level:

```
user1>> hubot NEW UPDATE
hubot>> @admin OK, I'll create a NOTICE from your next message.
        Reply with the message you'd like to send (or `cancel` within 30 seconds).
user1>> You may eat the pink cupcakes.
```

Sends to all users...

```
hubot>> You may eat the pink cupcakes.
        UPDATE sent by @user1
```


[npm-url]: https://npmjs.org/package/hubot-rocketchat-announcement
[npm-image]: http://img.shields.io/npm/v/hubot-rocketchat-announcement.svg?style=flat
