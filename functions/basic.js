const Models = require('../models/models.js');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const geoTz = require('geo-tz');
const dayjs = require('dayjs');
const token = '1229823290:AAH2TkJlo7f91s3W_WucEpB_RdqlXrCM-ns';
const bot = new TelegramBot(token);



async function send_error_message(id,err) {
    try {
        await bot.sendMessage(id, "Oops, something broke...");
        await bot.sendMessage(135987500, `${err.name}\n${err.message}`);
    }
    catch(err) {
        console.log(err);
    }
    return 0;
}

async function group_register(group_id, name) {
    try {
        const res = await Models.Groups.findOne({chat_id : group_id})
        if (!res) {
            const NewGroup = Models.Groups({chat_id : group_id, time_zone : "", name:name});
            await NewGroup.save();
            return true;
        }
        else {
            return false;
        }
    }
    catch(err) {
        await send_error_message(group_id, err);
        return false;
    }
}

async function group_check(group_id, need_time) {
    console.log('Checking group...');
    try {
        const temp = await Models.Groups.findOne({chat_id : group_id});
        if (!temp) {
            await bot.sendMessage(group_id, 'Not Authorised! Please use me in groups');
            return false;
        }
        else if (need_time && !temp.time_zone) {
            await bot.sendMessage(group_id, "You need to /settimezone to use this feature");
            return false;
        }
        else {
            return temp;
        }
    }
    catch(err) {
        await send_error_message(group_id, err);
        return false;
    }
}


async function add_user(msg, name) {
    try {
        const temp = await Models.Users.findOne({from_id : msg.from.id});
        if (!temp) {
            const newUser = Models.Users({from_id : msg.from.id, name : name, last_date : Date()});
            await newUser.save();
            await bot.sendMessage(msg.chat.id, `${name} has now registered!`);
            return true;
        }
        else {
            await bot.sendMessage(msg.chat.id, 'You have registered before!');
            return false;
        }
    }
    catch(err) {
        await send_error_message(msg.chat.id, err);
        return false;
    }
}

async function change_name(msg, name) {
    try {
        const temp = await Models.Users.findOne({from_id : msg.from.id});
        if (temp) {
            await Models.Users.updateOne({from_id : msg.from.id}, {name:name});
            await bot.sendMessage(msg.chat.id, `Your name is now ${name}`);
            return true;
        }
        else {
            await bot.sendMessage(msg.chat.id, "I don't recognise you, perhaps use /addme <name>?");
            return false;
        }
    }
    catch(err) {
        await send_error_message(msg.chat.id, err);
        return false;
    }
}

async function find_timezone(msg) {
    let res = "Please confirm the location by selecting the option\n";
    let choiceArr = [];
    const zoneArr = geoTz(msg.location.latitude, msg.location.longitude);
    zoneArr.forEach(item => {
        choiceArr.push([{text : item, callback_data: JSON.stringify({previous:'settimezone', choice:item})}]);
    });
    const opts = {
        reply_markup: JSON.stringify({
          inline_keyboard: choiceArr,
          resize_keyboard: true,
        }),
    };
    try {
        await bot.sendMessage(msg.chat.id, res, opts);
    }
    catch(err) {
        await send_error_message(msg.chat.id, err);
    }
    return 0;
}

async function finalize_timezone(msg, choice, message_id) {
    try {
        new dayjs().tz(choice);
    }
    catch(e) {
        await bot.sendMessage(msg.chat.id, "Unsupported timezone, I'm sorry");
        return false;
    }
    try {
        const callbackObj = await find_callback_from(msg);
        if (callbackObj && callbackObj.previous === 'settimezone') {
            const groupObj = await Models.Groups.findOne({chat_id : callbackObj.chat_id})
            if (groupObj) {
                groupObj.time_zone = choice;
                await groupObj.save();
                await Promise.all([
                    bot.editMessageText("Timezone has been set", {chat_id: msg.chat.id, message_id:message_id}),
                    bot.sendMessage(callbackObj.chat_id, "Time zone is now " + choice),
                    delete_callback({chat: {id:callbackObj.chat_id}, from: {id:msg.from.id}})
                ]);
            }
        }
        return true;
    }
    catch(err) {
        await send_error_message(msg.chat.id, err);
        return false;
    }
}

async function add_callback(msg, timezone, data, called) {
    try {
        await Models.Callbacks.deleteMany({chat_id: msg.chat.id, from_id: msg.from.id})
        const temp = Models.Callbacks({chat_id:msg.chat.id,
                                        from_id:msg.from.id,
                                        data:data,
                                        previous:called,
                                        time_zone: timezone});
        await temp.save();
        return true;
    }
    catch(err) {
        send_error_message(msg.chat.id, err);
        return false;
    }    
}

function find_callback(msg) {
    return Models.Callbacks.findOne({chat_id: msg.chat.id, from_id:msg.from.id});
}

function find_callback_from(msg) {
    return Models.Callbacks.findOne({from_id:msg.from.id});
}

async function delete_callback(msg) {
    await Models.Callbacks.deleteOne({chat_id: msg.chat.id, from_id: msg.from.id});
    return 0;
}

async function store_choice(msg, Arr) {
    try {
        await Models.Choices.deleteMany({chat_id: msg.chat.id, from_id: msg.from.id});
        const temp = Models.Choices({chat_id:msg.chat.id,
                                        from_id:msg.from.id,
                                        choices: Arr});
        await temp.save();
        return true;
    }
    catch(err) {
        send_error_message(msg.chat.id, err);
        return false;
    }   
}

function find_choice(msg) {
    return Models.Choices.findOne({chat_id: msg.chat.id, from_id: msg.from.id});
}

async function delete_choice(msg) {
    await Models.Choices.deleteOne({chat_id: msg.chat.id, from_id: msg.from.id});
    return 0;
}

function find_type(update) {
    const message = update.message;
    // const editedMessage = update.edited_message;
    // const channelPost = update.channel_post;
    // const editedChannelPost = update.edited_channel_post;
    // const inlineQuery = update.inline_query;
    // const chosenInlineResult = update.chosen_inline_result;
    const callbackQuery = update.callback_query;
    // const shippingQuery = update.shipping_query;
    // const preCheckoutQuery = update.pre_checkout_query;
    // const poll = update.poll;
    // const pollAnswer = update.poll_answer;
    if (message) {
        if (message.text || message.location) {
            return 'msg';
        }
        else {
            return 'us';
        }
    }
    else if (callbackQuery) {
        return "cb";
    }
    else {
        return 'us';
    }
}



module.exports.groupReg = group_register;
module.exports.groupCheck = group_check;
module.exports.findTimezone = find_timezone;
module.exports.finalizeTimezone = finalize_timezone;
module.exports.addUser = add_user;
module.exports.changeName = change_name;
module.exports.sendError = send_error_message;
module.exports.timezone = find_timezone;
module.exports.addCallback = add_callback;
module.exports.findCallback = find_callback;
module.exports.findCallbackFrom = find_callback_from;
module.exports.deleteCallback = delete_callback;
module.exports.storeChoice = store_choice;
module.exports.findChoice = find_choice;
module.exports.deleteChoice = delete_choice;
module.exports.findType = find_type;