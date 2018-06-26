FROM node:8-alpine

LABEL mantainer "Diego Dorgam <diego.dorgam@rocket.chat>"

ENV HUBOT_ADAPTER=rocketchat                                      \
  HUBOT_OWNER=RocketChat                                          \
  HUBOT_NAME=Notify                                               \
  HUBOT_DESCRIPTION="Send DMs to users in Rocket.Chat"            \
  HUBOT_LOG_LEVEL=debug                                           \
  ROCKETCHAT_URL=http://rocketchat:3000                           \
  ROCKETCHAT_USESSL='false'                                       \
  ROCKETCHAT_ROOM=GENERAL                                         \
  ROCKETCHAT_USER=notify                                          \
  ROCKETCHAT_PASSWORD=botuser-password                            \
  ROCKETCHAT_AUTH=password                                        \
  RESPOND_TO_DM=true                                              \
  RESPOND_TO_LIVECHAT=true                                        \
  RESPOND_TO_EDITED=true                                          \
  LISTEN_ON_ALL_PUBLIC=true                                       \
  MONGODB_URL=mongodb://mongo:27017/rocketchat

RUN apk --update add --no-cache git make gcc g++ python python-dev && \
  addgroup -S hubot && adduser -S -g hubot hubot

RUN npm install -g yo generator-hubot@1.0.0 node-gyp

ADD scripts/ /home/hubot/bot/scripts/

RUN mkdir -p /home/hubot/.config/configstore                             && \
  echo "optOut: true" > /home/hubot/.config/configstore/insight-yo.yml && \
  chown -R hubot:hubot /home/hubot

USER hubot

WORKDIR /home/hubot/bot


RUN yo hubot --adapter ${HUBOT_ADAPTER}         \
  --owner ${HUBOT_OWNER}             \
  --name ${HUBOT_NAME}               \
  --description ${HUBOT_DESCRIPTION} \
  --defaults --no-insight         && \
  rm /home/hubot/bot/external-scripts.json && \
  rm /home/hubot/bot/scripts/example.js

COPY ["external-scripts.json","package.json","index.js", "/home/hubot/bot/"]

RUN npm install --save

ENTRYPOINT /home/hubot/bot/bin/hubot -a ${HUBOT_ADAPTER} -n ${HUBOT_NAME} -l ${ROCKETCHAT_USER}
