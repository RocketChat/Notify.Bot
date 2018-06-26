// Description:
//   segment rocketchat user audience and notifies them through direct message.
// Commands:
//   hubot authorize <user-role>
//   hubot list targets 
//   hubot create target <target_name>
//   hubot delete target <target_name>
//   hubot set target <target_name>
//   hubot add user <username>
//   hubot del user <username>
//   hubot list users
//   hubot send <title> \n (shift+enter) <Message>
//   hubot report <title>
// Configuration:
//   MONGODB_URL
// Dependencies:
//   hubot-iwelt-mongodb-brain
// TODO:
//   bot resend <all|unread|edit> <notify_id>
//   bot delete <notify_id>

module.exports = function (robot) {
	var MONGODB_URL = process.env.MONGODB_URL || "mongodb://localhost:27017/hubot";
	var _ = require('underscore');
	// const Conversation = require('hubot-conversation');
	var dateFormat = require('dateformat');
	// const Q = require('q');
	// var targets = {};
	var help = {};
	var usersAndRoles = {};

	robot.brain.on('loaded', () => {
		if (!robot.brain.get('notifications')){
			return robot.brain.set('notifications', []);
		}
		robot.brain.setAutoSave(true);
	});

	function describe(command, description) {
		help[command] = description;
	}

	const getUserRoles = async function () {
		users = await robot.adapter.driver.callMethod('getUserRoles');
		if (users) {
			robot.logger.debug("gUR Users: " + JSON.stringify(users));
			users.forEach(function (user) {
				user.roles.forEach(function (role) {
					if (typeof (usersAndRoles[role]) == 'undefined') {
						usersAndRoles[role] = [];
					}
					usersAndRoles[role].push(user.username);
				});
			});
			robot.logger.info("gUR Users and Roles loaded: " + JSON.stringify(usersAndRoles));
		}
		else {
			console.log("gUR NOT loaded!!!");
		}
	};
	getUserRoles();

	const checkRole = async function (role, uname)
	{
		robot.logger.debug("cR uname: " + uname);
		robot.logger.debug("cR role: " + role);
		if (typeof (usersAndRoles[role]) !== 'undefined') {
			if (usersAndRoles[role].indexOf(uname) === -1) {
				robot.logger.debug("cR role: " + role);
				robot.logger.debug("cR indexOf: " + usersAndRoles[role].indexOf(uname));
				return false;
			}
			else {
				return true;
			}
		}
		else {
			robot.logger.info("Role " + role + " não encontrado");
			return false;
		}
	};
	// Remove the robot name to isolate the matched words
	const stripRobotName = function (match) {
		let named;
		const nameStart = match.charAt(0) === '@' ? 1 : 0;
		if (match.indexOf(robot.name) === nameStart) {
			named = robot.name;
		}
		else if (match.indexOf(robot.alias) === nameStart) {
			named = robot.alias;
		}
		else if (match.indexOf('Hubot') === nameStart) {
			named = 'Hubot'; // dialog prepends hubot (this is dumb)
		}
		else if (match.indexOf('hubot') === nameStart) {
			named = 'hubot';
		}
		let nameLength = named === undefined ? 0 : nameStart + named.length;
		if (match.charAt(nameLength) === ':') {
			nameLength++;
		}
		return match.substring(nameLength).trim();
	};

	function limitResult(res, result) {
		if (res.params.limit > 0) {
			return result.slice(0, res.params.limit);
		}
		return result;
	}
	const extractParams = function (res, params) {
		params = params.replace(/\s+/g, '').split(',');
		var defaultParams = {
			'target': function () {
				return robot.brain.get('default_target_by_room_' + res.envelope.room);
			}
		};
		for (var i = 0; i < params.length; i++) {
			var param = params[i];
			res.params[param] = res.match[i + 1];
			if (!res.params[param] && defaultParams[param]) {
				res.params[param] = typeof defaultParams[param] === 'function' ? defaultParams[param]() : defaultParams[param];
			}
		}
	};
	function getSetTargetMessage() {
		var robot_name = robot.alias || robot.name;
		return `Use \`${robot_name} target set <target_name>\` to set default target`;
	}
	// Renders
	function renderTargets(res, msg, records) {
		var found = false;
		keys = _.keys(records);
		_.each(keys, function(item) {
			if (String(item) === String(robot.brain.get('default_target_by_room_' + res.envelope.room))) {
				found = true;
				msg += `- **${item}**`;
			}else{
				msg += `- ${item}`;
			}
			msg += `\n`;
		});
		if (found === false) {
			msg += '\n' + getSetTargetMessage();
		}
		return msg;
	}
	function renderUsers(res, msg, records) {
		var initialLength = msg.length;
		var found = false;
		// console.log('\n\n\n>>> RENDER USER RECORDS');
		// console.log(typeof(records));
		console.log(records);
		for(username in records){
			found = true;
			msg += `@${records[username]}, `;
			console.log(msg);
		};
		if (!found) {
			return msg = `**No users found in this target**`;
		} else {
			return msg.trim().substring(0, msg.length - 2);
		}
	}
	const sendNotification = async function (res, users){
		msg = res.params.message.trim();
		receipts = [];
		rids = [];
		await _.each(users, async function (username) {
			try{
				// get room id
				rid = await robot.adapter.driver.getDirectMessageRoomId(username);
				receipt = await robot.adapter.driver.sendToRoomId(msg, rid);
				receipt['to'] = username;
				small_receipt = {
					rid: receipt['rid'],
					send_date: receipt['ts']['$date'],
					_id: receipt['_id'],
					to: receipt['to']
				};
			}catch (e) {
				return robot.logger.error(`Error sending direct message to ${username}: ${ e }`);
			} finally {
				receipts.push(small_receipt);
			}
		});
		notifications = robot.brain.get("notifications") || [];
		notification = {
			_id: res.message._id,
			title: res.params.title,
			message: res.params.message,
			to: users,
			rcpt: receipts
		};
		notifications.push(notification);
		robot.brain.set("notifications", notifications);
		return receipts;
	}

	// Set auth framework
	robot.listenerMiddleware(function (context, next, done) {
		context.response.params = context.response.params || {};
		if (!context.listener.options) {
			return next();
		}
		if (context.listener.options.params) {
			extractParams(context.response, context.listener.options.params);
		}
		if (context.listener.options.requireTarget === true) {
			if (!context.response.params.target) {
				context.response.params.target = robot.brain.get('default_target_by_room_' + context.response.envelope.room);
				if (!context.response.params.target) return context.response.reply(getSetTargetMessage());
			}
		}
		// check security clearance
		if (robot.brain.get('security_role_by_room_' + context.response.envelope.room) !== null) {
			if (checkRole(robot.brain.get('security_role_by_room_' + context.response.envelope.room), context.response.message.user.name) || checkRole('admin', context.response.message.user.name)) {
				robot.logger.debug("ACCESS GRANTED in middlewareListener");
			}
			else {
				robot.logger.debug("ACCESS DENIED in middlewareListener");
				return context.response.reply("`Access Denied!`");
			}
		}
		next();
	});
	robot.receiveMiddleware(function (context, next, done) {
		// check for message reading receipt
		if (context.response.envelope.user.roomType == "d") {
			// receiving a direct message check if needs reading receipt
			notifications = robot.brain.get('notifications');
			for (let i = 0; i < notifications.length; i++) {
				if (notifications[i].to.indexOf(context.response.message.user.name)>-1) {
					for (let j = 0; j < notifications[i].rcpt.length; j++) {
						if (context.response.message.user.name == notifications[i].rcpt[j].to) {
							if (!notifications[i].rcpt[j].received || notifications[i].rcpt[j].received === undefined) notifications[i].rcpt[j].received = Date.now();
						}
					}
				}
			}
			robot.brain.set('notifications', notifications);
		}
		next()
	});

	///////////////
	// LISTENERS //
	///////////////

	// Security
	robot.respond(/auth(?:orize)? (.+)/i, { params: 'rc_role' }, function (res) {
		robot.logger.debug("CB rc_role=" + res.params.rc_role);
		if (!res.params.rc_role) {
			robot.logger.info("No role given");
			return res.reply(`You need to specify an actual Rocket.Chat role.`);
		}
		else {
			if (checkRole('admin', res.message.user.name)) {
				if (typeof (usersAndRoles[res.params.rc_role]) !== 'undefined') {
					robot.brain.set('security_role_by_room_' + res.envelope.room, res.params.rc_role);
					res.reply(`New access level setted to role \`${robot.brain.get('security_role_by_room_' + res.envelope.room)}\``);
				}
				else {
					res.reply(`The role \`${res.params.rc_role}\` was not found. Please use an actual role.`);
				}
			}
			else {
				res.reply(`Access Denied! You must have admin role to perform this action.`);
			}
		}
	});
	//LIST
	robot.respond(/l(?:ist) t(?:argets)?/i, { }, function (res) {
		records = robot.brain.get('targets_by_room_' + res.envelope.room);
		var msg = 'This are the targets you created:\n';
		res.reply(renderTargets(res, msg, records));
	});
	// TARGET CREATE
	robot.respond(/c(?:reate)? t(?:arget)? (.+)/i, { params: 'target' }, function (res) {
		if (res.params.target) {
			if (res.params.target.trim() == 'all' || res.params.target.trim() == 'online'){
				return res.reply(`Target \`${res.param.target.trim()}\` is a pre-defined target, and cannot be used. Please choose a different target name.`);
			}else{
				// create a target
				targets = robot.brain.get('targets_by_room_' + res.envelope.room) || {};
				if (res.params.target.trim() in targets) {
					return res.reply(`Target ${res.params.target.trim()} already exists`);
				} else {
					targets[res.params.target.trim()] = [];
					robot.brain.set('targets_by_room_' + res.envelope.room, targets)
					robot.brain.set('default_target_by_room_' + res.envelope.room, res.params.target.trim())
					return res.reply(`Target ${res.params.target.trim()} created and set as default!`);
				}
			} 
		} else {
			return res.reply(`Please specify a target name!`);
		}
	});
	// TARGET SET
	robot.respond(/set t(?:arget)? (.+)/i, {params: 'target'}, function (res) {
		if(!res.params.target){
			return res.reply(`Please specify a target name`);
		}else{
			//check if target exists
			targets = robot.brain.get('targets_by_room_' + res.envelope.room);
			if(targets.hasOwnProperty(res.params.target.trim())){
				// target exists, set it as default
				robot.brain.set('default_target_by_room_' + res.envelope.room, res.params.target);
				return res.reply(`Target ${res.params.target} was set as default!`);

			}else if(res.params.target.trim() == 'all' || res.params.target.trim() == 'online'){

				robot.brain.set('default_target_by_room_' + res.envelope.room, res.params.target);
				return res.reply(`Target \`${res.params.target.trim()}\` was set as default!`);

			}else{
				// target doesn't exists
				return res.reply(`Sorry, target \`${res.params.target.trim()}\` is not in target list!`);
			}
		}
	});

	// TARGET DELETE
	robot.respond(/del(?:ete)? t(?:arget)? (.+)/i, { params: 'target' }, function (res) {
		var targets = robot.brain.get('targets_by_room_' + res.envelope.room);
		if (res.params.target.trim() in targets) {
			try {
				delete targets[res.params.target.trim()];
				robot.brain.set('targets_by_room_' + res.envelope.room, targets)
			} catch (e) {
				console.error('something bad happened, target couldn\'t be removed\n' + e);
			} finally {
				return res.reply(`Target ${res.params.target} was deleted!`);
			}
		} else {
			return res.reply(`Target ${res.params.target} was not found!`);
		}
		
	});

	// Add User
	robot.respond(/add u(?:ser)? (.+)/i, { params: 'username', requireTarget: true }, async function (res) {
		//TODO: Checks if username is the sender or the robot
		var target_name = robot.brain.get('default_target_by_room_' + res.envelope.room);
		var targets = robot.brain.get('targets_by_room_' + res.envelope.room);
		new_user = res.params.username.trim();
		if (new_user.indexOf('@') > -1){ new_user = new_user.substring('1');} 
		if (new_user == 'all' || new_user == 'online') {
			temp_usernames = (new_user == 'all') ? await robot.adapter.api.users.allNames() : await robot.adapter.api.users.onlineNames();
			let usernames = [];
			for(key in temp_usernames){
				usernames.push(temp_usernames[key]);
			}
			// add all users to target
			let added = [];
			let not_added = [];
			for(user in usernames){
				// check if User exists
				if (targets[target_name].indexOf(usernames[user]) == -1){
					if (targets[target_name].push(usernames[user])) {
						robot.logger.debug(`User ${usernames[user]} added to ${target_name}\n`);
						added.push(usernames[user]);
					} else {
						not_added.push(usernames[user]);
					}
				}else{
					added.push(usernames[user]);
					robot.logger.debug(`User ${usernames[user]} already exists in ${target_name}\n`);
				}
			}
			msg = `From all users(${usernames.length}) I was able to add ${added.length} to ${target_name}.\n`;
			if(not_added.length > 0) msg += `There was ${not_added.length} users I wasn't able to add to ${target_name}`;
			return res.reply(msg);
		}else{
			if (targets[target_name].push(new_user)) {
				robot.brain.set('targets_by_room_' + res.envelope.room, targets);
				return res.reply(`User ${res.params.username} was added to ${target_name}!`);
			}
		}

	});

	// User delete
	robot.respond(/del(?:ete)? u(?:ser)? (.+)/i, { params: 'username', requireTarget: true }, function (res) {
		var target_name = robot.brain.get('default_target_by_room_' + res.envelope.room);
		var targets = robot.brain.get('targets_by_room_' + res.envelope.room);
		var records = targets[target_name];
		if (records.indexOf(res.params.username.trim()) > -1){
			try {
				delete records[records.indexOf(res.params.username.trim())];
				targets[target_name] = records;
				robot.brain.set('targets_by_room_' + res.envelope.room, targets);
			} catch (e) {
				console.error('something bad happened, user couldn\'t be removed');
			}finally{
				return res.reply(`User ${res.params.username} was delete from ${target_name}!`);
			}
		} else {
			return res.reply(`User ${res.params.username} was not found in ${target_name}!`);
		}
		
		
	});

	// User list
	robot.respond(/l(?:ist) u(?:sers)?/i, {
				requireTarget: true
			}, function (res) {
		defaultTarget = robot.brain.get('default_target_by_room_'+res.envelope.room);
		if(defaultTarget){
			var targets = robot.brain.get('targets_by_room_' + res.envelope.room);
			var records = targets[defaultTarget];
			var msg = `These are the users in ${defaultTarget}:\n`;
			res.reply(renderUsers(res, msg, records));
		} else {
			return res.reply(getSetTargetMessage());
		}

	});
	// Send Notification
	robot.respond(/s(?:end)?\s(.+)\s*\n?((?:(.|\n)*\n?)*)/i, { params: 'title, message', requireTarget: true }, async function (res) {
		defaultTarget = robot.brain.get('default_target_by_room_'+res.envelope.room);
		if(defaultTarget){
			if (defaultTarget == 'all' || defaultTarget == 'online'){
				var temp_records = (defaultTarget == 'all') ? await robot.adapter.api.users.allNames() : await robot.adapter.api.users.onlineNames();
				let records = [];
				for (key in temp_records) {
					records.push(temp_records[key]);
				}
			}else{
				var targets = robot.brain.get('targets_by_room_' + res.envelope.room);
				var records = targets[defaultTarget];
			}
			if (records.indexOf(res.envelope.user.name) > -1) records.pop(res.envelope.user.name);
			robot_name = robot.alias || robot.name;
			if (records.indexOf(robot_name) > -1) records.pop(robot_name);
			if (res.params.message) {
				try{
					res.reply(`Your message:\n${res.params.title}\nis being sended to:\n${records}`);
					returned_receipts = await sendNotification(res, records);
					if (returned_receipts.length > 0) {
						return res.reply(`Your message has been sent to ${returned_receipts.length} users`);
					} else {
						return res.reply(`Your wasn't sent to anyone, please verify the logs for more details`);
					}
				}catch (e){
					console.error(e);
				}
			}
		} else {
			return res.reply(getSetTargetMessage());
		}
	});

	// Report Notification
	robot.respond(/re(?:port)? (.+)/i, { params: 'title' }, function (res) {
		//check if title was given 
		notifications = robot.brain.get('notifications');
		if (!res.params.title){
			titles = notifications.filter(n => n.title.trim());
			titles = title.join('\n>');
			return res.reply('Please especify the title of the notification:\n'+titles);
		} else {
			notification = notifications.filter(n => n.title.trim() == res.params.title.trim());
			let received = 0;
			let total = notification[0].to.length;
			let msg_seen = '';
			let msg_not = '';
			for(let i=0; i< notification[0].rcpt.length;i++){
				if (notification[0].rcpt[i].received){
					viz_date = new Date(notification[0].rcpt[i].received);
					viz_date = dateFormat(viz_date, 'dd/mm/yyyy HH:MM:ss');
					msg_seen += `+ @${notification[0].rcpt[i].to} (${viz_date})\n`;
					received++;
				}else{
					msg_not += `- @${notification[0].rcpt[i].to}\n`;
				}
			}
			msg = `Here is your report on \`${res.params.title}\`:\n`;
			msg += `${received} reads from total ${total}\n`;
			msg += msg_seen;
			msg += '-----------------------\nUsers who did not responded:\n';
			msg += msg_not;
			return res.reply(msg);
		}
	});

	// // Catch ALL
	// robot.catchAll(function (res) {
	// 	res.reply('thanks =)');
	// });

}
