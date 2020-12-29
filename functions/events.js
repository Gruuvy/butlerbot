const Models = require('../models/models.js');
const Basic = require('./basic.js');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc'); // dependent on utc plugin
const timezone = require('dayjs/plugin/timezone');
const objectSupport = require("dayjs/plugin/objectSupport");
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(objectSupport);

const token = process.env.TELEGRAMTOKEN;
const bot = new TelegramBot(token, {onlyFirstMatch:true});


async function add_event(msg, datestr, data, time_zone) {
    try {
        let name = data.name
        const date_adjusted = dayjs.tz(datestr, time_zone);
        const dateObj = date_adjusted.toDate();
        const NewEvent = Models.Events({
            name: name,
            date : dateObj,
            chat_id : msg.chat.id
        })
        await NewEvent.save();
        await Promise.all([
            bot.sendMessage(msg.chat.id, `${name} has been added on ${datestr}`),
            bot.editMessageText(`You have chosen ${datestr}`, {chat_id: msg.chat.id, message_id: data.message_id}),
            Basic.deleteCallback(msg)
        ]);

        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }    
}

async function delete_event(msg, match, time_zone) {
    try {
        const results = await Models.Events.find({chat_id : msg.chat.id, name : match[1]});
        if (results.length === 0) {
            await bot.sendMessage(msg.chat.id, "No event found");
            return -1;
        }
        else if (results.length === 1) {
            await Models.Events.deleteOne({chat_id : msg.chat.id, name : match[1]});
            await bot.sendMessage(msg.chat.id, "Deleted successfully");
            return 0;
        }
        else {
            const stored = Basic.storeChoice(msg, results);

            let res = "Multiple results found, please choose the correct one\n";
            const keyboard_choices = [];
            let counter = 1;
            results.forEach( (item) => {
                const dayObj = new dayjs(item.date).tz(time_zone);
                let temp = [{text:`${item.name} ${dayObj.format('ddd DD MMM YYYY')}`, callback_data: JSON.stringify({previous:'deleteevent', choice:counter})}];
                keyboard_choices.push(temp);
                counter += 1;
            });
            const opts ={
                reply_markup: {
                    inline_keyboard: keyboard_choices
                } 
            };
            if (await stored) {
                await bot.sendMessage(msg.chat.id, res, opts);
            }
            return 0;
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function delete_single(msg ,choice, callbackId, message_id) {
    try {
        const choiceObj = await Basic.findChoice(msg);
        if(!choiceObj) {
            await bot.sendMessage(msg.chat.id, "Something went wrong");
            return -1;
        }
        const Arr = choiceObj.choices;
        if (choice <= 0 || choice > Arr.length) {
            await bot.sendMessage(msg.chat.id, 'Invalid choice');
            return -1;
        }
        const obj_id = Arr[choice-1]._id;
        await Models.Events.deleteOne({_id : obj_id});
        await Promise.all([
            Basic.deleteChoice(msg),
            bot.editMessageText("Deleted successfully", {chat_id: msg.chat.id, message_id: message_id})
        ]);
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function display_events(msg, time_zone) {
    try {
        await Models.Events.deleteMany({date : {$lt: Date()}});
        const temp = await Models.Events.find({chat_id : msg.chat.id}).sort('date');
        let res = "*Events:*";
        let currdate = new dayjs('2000-1-1', time_zone);
        let counter = 1;
        function sort_dates(item) {
            const temp_obj = new dayjs(item.date).tz(time_zone);
            const no_time_obj = temp_obj.startOf('day');
            if (no_time_obj.isAfter(currdate)) {
                counter = 1;
                currdate = no_time_obj;
                res += ("\n*" + currdate.format('ddd DD MMM YYYY') + "*\n");
            }
            const time_only = ('0000' + (temp_obj.hour() * 100 + temp_obj.minute())).slice(-4);
            const words = counter + "\\. " + item.name + " " + (time_only == '0000' ? "" : time_only) + "\n";
            res += words;
            counter += 1;
        }
        temp.forEach(sort_dates);
        await bot.sendMessage(msg.chat.id, res == "" ? "No events\\!" : res, {parse_mode: 'MarkdownV2'} );
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}


module.exports.eventAdd = add_event;
module.exports.eventDisplay = display_events;
module.exports.eventDelete = delete_event;
module.exports.eventDeleteSingle = delete_single;