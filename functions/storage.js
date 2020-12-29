const Models = require('../models/models.js');
const Basic = require('./basic.js');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const dayjs = require('dayjs');
const e = require('express');
const token = process.env.TELEGRAMTOKEN;
const bot = new TelegramBot(token, {onlyFirstMatch:true});



async function set_storage(msg, name) {
    try {
        const messageObj = await bot.sendMessage(msg.chat.id, "Processing...");
        if (await Basic.addCallback(msg, "", JSON.stringify({name:name, message_id:messageObj.message_id}), "storage")) {
            await bot.editMessageText("What would be the value to store?\nExample call /value Food Water Fruits", {chat_id: msg.chat.id, message_id: messageObj.message_id});
        }
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function set_values(msg, values) {
    try {
        const callbackObj = await Basic.findCallback(msg);
        const data = JSON.parse(callbackObj.data);
        if (!callbackObj || callbackObj.previous !== 'storage') {
            return -1;   
        }
        const name = data.name.toLowerCase().split(' ').map(capitalize).join(' ');
        let NewStorage = await Models.Storage.findOne({chat_id: msg.chat.id, name:name});
        if (!NewStorage) {
            NewStorage = Models.Storage({
                chat_id : msg.chat.id,
                name : name,
                value: values
            });
        }
        else {
            NewStorage.value = values;
        }
        await NewStorage.save();
        await Promise.all([
            bot.editMessageText("You have selected " + values, {chat_id: msg.chat.id, message_id:data.message_id}),
            bot.sendMessage(msg.chat.id, `Saved ${name} as ${values}`),
            Basic.deleteCallback(msg)
        ]);
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function lookup_storage(msg, action) {
    try {
        const lookup = await Models.Storage.find({chat_id: msg.chat.id});
        if (lookup) {
            if (lookup.length !== 0) {
                const stored = Basic.storeChoice(msg, lookup); 

                let res = action === "delsto" ? "Which do you want to delete?\n" : "Which do you want to view?\n";
                const keyboard_choices = [];
                let counter = 1;
                lookup.forEach( (item) => {
                    let temp = [{text: item.name, callback_data: JSON.stringify({previous:action, choice:counter})}];
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
            }
            else {
                await bot.sendMessage(msg.chat.id, "There are no stored values yet");
            }
        }
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function lookup_one(msg, choice, message_id) {
    try {
        const choiceObj = await Basic.findChoice(msg);
        if (!choiceObj) {
            return -1;
        }
        const value = choiceObj.choices[choice-1].value;
        await Promise.all([
            bot.editMessageText(value, {chat_id: msg.chat.id, message_id:message_id}),
            Basic.deleteChoice(msg)
        ]);
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function delete_storage(msg, choice, message_id) {
    try {
        const choiceObj = await Basic.findChoice(msg);
        if (!choiceObj) {
            return -1;
        }
        const storageObj = choiceObj.choices[choice-1];        
        await Models.Storage.deleteOne(storageObj);
        await Promise.all([
            bot.editMessageText("Successfully deleted " + choiceObj.choices[choice-1].name, {chat_id: msg.chat.id, message_id:message_id}),
            Basic.deleteChoice(msg)
        ]);
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

module.exports.setStorage = set_storage;
module.exports.setValues = set_values;
module.exports.lookupStorage = lookup_storage;
module.exports.lookupOne = lookup_one;
module.exports.deleteStorage = delete_storage;