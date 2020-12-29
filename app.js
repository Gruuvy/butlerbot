const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Events = require('./functions/events.js');
const Basic = require('./functions/basic.js');
const Chores = require('./functions/chores.js');
const Storage = require('./functions/storage.js');
const app = express();
const serverless = require('serverless-http');
const uri = process.env.MONGOURI;

// parse application/json
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// mongoose
let cachedDb = false;

// cached db??
async function connectToDB() {
    if (cachedDb) {
        return true;
    }
    return mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
            .then(() => {
                console.log("connected");
                cachedDb = true;
                return true;
            })
            .catch(err =>{
                console.log(err);
                return false;
            })
}

const TelegramBot = require('node-telegram-bot-api');
const { stringify } = require('querystring');
const { rejects } = require('assert');
const token = process.env.TELEGRAMTOKEN;
const bot = new TelegramBot(token, {onlyFirstMatch:true});
//bot.setWebHook("https://1ce51628ff78.ngrok.io");

const promises = {};

process.on('unhandledRejection', function(err, promise) {
    console.error('Unhandled rejection ' + err.message);
});


bot.on("callback_query", async function(data){
    let temp = JSON.parse(data.data);
    const chat_id = data.message.chat.id;
    const message_id = data.message.message_id;
    const msg = {from:{id:data.from.id},chat:{id:data.message.chat.id}};
    try {
        await bot.editMessageReplyMarkup({ inline_keyboard: []}, {chat_id:chat_id, message_id:message_id});
        if (temp.previous === "deleteevent") {
            await Events.eventDeleteSingle(msg, temp.choice, data.id, message_id);
        }
        else if (temp.previous === 'choresmain') {
            await Chores.choresReply(msg, temp.choice, temp.name, message_id);
        }
        else if (temp.previous === 'choresswap1') {
            await Chores.swapSecond(msg, temp.choice, message_id);
        }
        else if (temp.previous === 'choresswap2') {
            await Chores.swapFinally(msg, temp.choice, message_id);
        }
        else if (temp.previous === "lookupstorage") {
            await Storage.lookupOne(msg, temp.choice, message_id);
        }
        else if (temp.previous === "settimezone") {
            await Basic.finalizeTimezone(msg, temp.choice, message_id);
        }
        else if (temp.previous === 'delete') {
            await Chores.choresHandler(msg, 'delete', {choice:temp.choice, message_id:message_id});
        }
        else if (temp.previous === 'unassign') {
            await Chores.deleteRoster(msg, temp.choice, message_id);
        }
        else if (temp.previous === 'delsto') {
            await Storage.deleteStorage(msg, temp.choice, message_id);
        }
    } catch(err) {
        await Basic.sendError(chat_id, err);
        console.log(err);
    }
    promises[message_id]();
    delete promises[message_id];
});



// start
bot.onText(/\/start(?:@autobutler_bot)?\s?(.+)?/, async (msg, match) => {
    if (msg.chat.type === "private") {
        try {
            const callbackObj = await Basic.findCallbackFrom(msg);
            if (!callbackObj) {
                await bot.sendMessage(msg.from.id, "I am only usable in group chats");
            }
            else {
                const groupObj = await Basic.groupCheck(callbackObj.chat_id, false);
                if (callbackObj.previous === "settimezone") {
                    const opts = {
                        reply_markup: JSON.stringify({
                        keyboard: [
                            [{text: 'Share location', request_location: true}],
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: true,
                        })
                    };
                    await bot.sendMessage(msg.from.id, 'Setting timezone for ' + groupObj.name, opts);
                }
                else {
                    await bot.sendMessage(msg.from.id, "Please use me in group chats");
                }
            }
        }
        catch(err) {
            await Basic.sendError(msg.chat.id, err);
        }
    }
    else {
        if (match[1] === process.env.REG_TOKEN) {
            if (await Basic.groupReg(msg.chat.id, msg.chat.title)) {
                await bot.sendMessage(msg.chat.id, 'Group registered!');
            }
            else {
                await bot.sendMessage(msg.chat.id, 'You have registered before!');
            }
        }
        else {
            await bot.sendMessage(msg.chat.id, "Sorry, but you are not authorised");
        }
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];
});

bot.onText(/\/settimezone(?:@autobutler_bot)?/, async (msg) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, false);
        if (groupObj) {
        
        const opts = {
        reply_markup: JSON.stringify({
            keyboard: [
            [{text: 'Share location', request_location: true}],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
        })
        }
        if (await Basic.addCallback(msg, "", msg.chat.id, "settimezone")) {
            try {
                await bot.sendMessage(msg.from.id, 'Location request', opts);
                await bot.sendMessage(msg.chat.id, 'I sent you a PM for your location');
            }
            catch {
                await bot.sendMessage(msg.chat.id, "Please initiate a private chat with me first");
            }
        }
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];
});

// location data... special callback only for location.
bot.on('location', async (msg) => {
    try {
        const callbackObj = await Basic.findCallbackFrom(msg);
        if (callbackObj) {
            if (callbackObj.previous === "settimezone") {
                await Basic.findTimezone(msg);
            }
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];    
});

// addme.basic
bot.onText(/\/addme(?:@autobutler_bot)? (.+)/, async (msg, match) => {
    if (await Basic.groupCheck(msg.chat.id, false)) {
        await Basic.addUser(msg, match[1]);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];
});

bot.onText(/\/name(?:@autobutler_bot)? (.+)/, async (msg, match) => {
    if (await Basic.groupCheck(msg.chat.id, false)) {
        await Basic.changeName(msg, match[1]);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

// add dates...
bot.onText(/\/date(?:@autobutler_bot)? (.+)/, async (msg, match) => {
    try {
        const callbackObj = await Basic.findCallback(msg);
        if (callbackObj) {
            if (callbackObj.previous === "addevent") {
                await Events.eventAdd(msg, match[1], JSON.parse(callbackObj.data), callbackObj.time_zone);
            }
            else if (callbackObj.previous === 'addchore') {
                await Chores.addChoredate(msg, match[1], JSON.parse(callbackObj.data));
            }
        }
        else {
            await bot.sendMessage(msg.chat.id, "You didn't specify anything to add date to");
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

// addevent
bot.onText(/\/addevent(?:@autobutler_bot)? (.+)/, async (msg, match) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, true);
    if (groupObj) {
        if (! /^[a-zA-Z0-9' ]+$/.test(match[1])) {
            await bot.sendMessage(msg.chat.id, "Please do not enter any special characters except ' (apostrophe)");
        }
        else {
            const messageObj = await bot.sendMessage(msg.chat.id, 'Please enter the date in "YYYY-MM-DD HH:mm" format!\n' +
            'Zeros can be omitted: Example calls:\n' +
            '"/date 2020-12-01 12:30" for 1 Dec 12.30pm\n' +
            '"/date 2020-1-1 14" for 1 Jan 2pm\n' +
            '"/date 2020-1-1" for just 1 Jan without time');
            if (await Basic.addCallback(msg, groupObj.time_zone, JSON.stringify({name:match[1],message_id:messageObj.message_id}), "addevent") ) {
            }
            else {
                await bot.deleteMessage(msg.chat.id, messageObj.message_id);
            }
        }
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

// delete event
bot.onText(/\/deleteevent(?:@autobutler_bot)? (.+)/, async (msg, match) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, false);
    if (groupObj) {
        await Events.eventDelete(msg,match, groupObj.time_zone);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];
});

// show events
bot.onText(/\/events(?:@autobutler_bot)?/, async (msg) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, true);
    if (groupObj) {
        await Events.eventDisplay(msg, groupObj.time_zone);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

// add chore
bot.onText(/\/addchore(?:@autobutler_bot)? (.+)/, async (msg, match) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, true);
    if (groupObj) {
        if (! /^[a-zA-Z0-9' ]+$/.test(match[1])) {
            await bot.sendMessage(msg.chat.id, "Please do not enter any special characters except apostrophes(')");
        } else {
            await Chores.addChore(msg, match[1]);
        }
        
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

bot.onText(/\/chores(?:@autobutler_bot)?/, async (msg) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, true);
    if (groupObj) {
        await Chores.choresMain(msg);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

bot.onText(/\/assignme(?:@autobutler_bot)?/, async (msg) => {
    await Chores.choresHandler(msg, "assignme", "");
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

bot.onText(/\/order(?:@autobutler_bot)? (\d+)/, async (msg, match) => {
    await Chores.choresHandler(msg, "order", match[1])
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

bot.onText(/\/init(?:@autobutler_bot)? (\d+)/, async (msg, match) => {
    await Chores.choresHandler(msg, "init", match[1]);
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

bot.onText(/\/update(?:@autobutler_bot)?/, async (msg) => {
    await Chores.choresHandler(msg, 'update', "");
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

bot.onText(/\/display(?:@autobutler_bot)?/, async (msg) => {
    await Chores.choresHandler(msg, 'display', "");
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

bot.onText(/\/skip(?:@autobutler_bot)? (\d+)/, async (msg, match) => {
    await Chores.choresHandler(msg, 'skip', match[1]);
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

bot.onText(/\/swap(?:@autobutler_bot)?/, async(msg) => {
    await Chores.choresHandler(msg, 'swap', "");
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

bot.onText(/\/unassign(?:@autobutler_bot)?/, async(msg) => {
    await Chores.choresHandler(msg, 'unassign', "");
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

bot.onText(/\/delete(?:@autobutler_bot)?/, async (msg) => {
    try {
        const callbackObj = await Basic.findCallback(msg);
        if (callbackObj) {
            if (callbackObj.previous === 'choresmain') {
                Chores.confirmDelete(msg);
            }
        }
    }
    catch {
        await Basic.sendError(msg.chat.id, err);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
});

bot.onText(/\/set(?:@autobutler_bot)? (.+)/, async (msg, match) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, false);
    if (groupObj) {
        await Storage.setStorage(msg, match[1]);
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

bot.onText(/\/value(?:@autobutler_bot)? (.+)/, async (msg, match) => {
    await Storage.setValues(msg, match[1]);
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})


bot.onText(/\/lookup(?:@autobutler_bot)?/, async (msg) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, false);
    if (groupObj) {
        await Storage.lookupStorage(msg, "lookupstorage");
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

bot.onText(/\/forget(?:@autobutler_bot)?/, async (msg, match) => {
    const groupObj = await Basic.groupCheck(msg.chat.id, false);
    if (groupObj) {
        await Storage.lookupStorage(msg, "delsto");
    }
    promises[msg.message_id]();
    delete promises[msg.message_id];  
})

// bot.onText(/\/test/, async (msg, match) => {
//     console.log('test');
//     console.log(Date());

    
//     console.log("HMMMMM");
//     const msgID = msg.message_id;
//     promises[msgID]();
// })

bot.onText(/.+/, async (msg) => {
    console.log('received');
    try {
        promises[msg.message_id]();
        delete promises[msg.message_id]; 
    }
    catch (err) {
        console.log('Promise was done');
    }
})

app.post('/', async function (req, res) {
    const start = Date.now();
    if (await connectToDB()) {
        console.log(req.body);
        const typein = Basic.findType(req.body);
        if (typein === 'us') {
            console.log('unsupported');
            res.sendStatus(200);
        }else {
            const x = process_update_promise(req.body, typein);
            const y = timer_6000ms();
            Promise.race([x,y]).then(() => {
                console.log((Date.now() - start) / 1000);
                res.sendStatus(200);
            })
            .catch(err => {
                console.log(err);
                res.sendStatus(200);
            });
        }

    } else {
        await bot.sendMessage(req.body.message.chat.id, 'Something went wrong...');
        console.log('DB not connected!');
        res.sendStatus(200); // just send the OKAY!
    }
    //res.sendStatus(200);
});


// app.listen(port, () => {
//     console.log("listening");
// })

function process_update_promise(input, typein) {
    // const msgID = input.message.message_id;
    const promise = new Promise((resolve,reject) => {
        let msgID;
        if (typein === 'msg') {
            msgID = input.message.message_id;
        } else if (typein === 'cb') {
            msgID = input.callback_query.message.message_id;
        }
        promises[msgID] = resolve;
    });
    bot.processUpdate(input);
    return promise;
}

function timer_6000ms() {
    return new Promise((resolve) => {
        setTimeout(resolve, 6000);
    });
}

module.exports.handler = serverless(app);