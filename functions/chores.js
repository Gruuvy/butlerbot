const Models = require('../models/models.js');
const Basic = require('./basic.js');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const e = require('express');
const dayjs = require('dayjs');
const token = '1229823290:AAH2TkJlo7f91s3W_WucEpB_RdqlXrCM-ns';
const bot = new TelegramBot(token);
const isoWeek = require('dayjs/plugin/isoWeek')
dayjs.extend(isoWeek)


async function add_chore(msg, name, time_zone) {
    try {
        const lookup = await Models.Chores.findOne({chat_id : msg.chat.id, name : name});
        if (lookup) {
            bot.sendMessage(msg.chat.id, "This chore already exists!");
            return 0;
        }
        else {
            const messageObj = await bot.sendMessage(msg.chat.id, "Processing...");
            if (await Basic.addCallback(msg, time_zone, JSON.stringify({name:name, message_id:messageObj.message_id}), "addchore")) {
                bot.editMessageText("Which days would you carry out this chore? Indicate as comma-separated numbers\n" +
                                'Example call: Monday, Wednesday, Saturday would be\n"/date 1,3,6"\n' +
                                'For every "x" days, type "every x". Example call: every 2 days\n"/date every 2" (maximum 99 days)',
                                {chat_id: msg.chat.id, message_id: messageObj.message_id});
            }
            return 0;
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

function validate_dates(Arr) {
    let res = true;
    if (Arr.length > 7 || Arr.length === 0) {
        return false;
    }
    Arr.forEach(date => {
        if (date < 1 || date > 7) {
            res = false;
        }
    })
    return res;
}

async function add_chore_date(msg, dates, data) {
    let name = data.name;
    const days = dates.split(',');
    let choretype = 1;
    let daysArr;
    if (days[0].length > 4) {
        daysArr = [parseInt(days[0].split(" ")[1])];
        if (isNaN(daysArr[0]) || daysArr[0] > 99 || daysArr[0] < 1) {
            await bot.sendMessage(msg.chat.id, "Invalid dates");
            return -1;
        }
        choretype = 0;
    }
    else {
        if (!validate_dates(days)) {
            await bot.sendMessage(msg.chat.id, "Invalid dates");
            return -1;
        }
        daysArr = [0,0,0,0,0,0,0];
        days.forEach(item => {
            daysArr[item-1] = 1;
        });
    }
    bot.editMessageText(`You have chosen ${dates}`, {chat_id: msg.chat.id, message_id: data.message_id});
    const newChore = Models.Chores({
        name: name,
        chat_id: msg.chat.id,
        days: daysArr,
        current : [], 
        date: new Date(),
        type: choretype
    });
    try {
        await newChore.save();
        await Promise.all([
            bot.sendMessage(msg.chat.id, `${name} has been added successfully`),
            Basic.deleteCallback(msg)
        ])
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function chores_main(msg) {
    try {
        const lookup = await Models.Chores.find({chat_id : msg.chat.id});
        const stored = Basic.storeChoice(msg, lookup);
        let res = lookup.length ? "Which chore do you want to view?" : "No chores available yet, add with /addchore <name>";
        const keyboard_choices = [];
        let counter = 1;
        lookup.forEach( (item) => {
            let temp = [{text: item.name, callback_data: JSON.stringify({previous:'choresmain', choice:counter, name:item.name})}];
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
            return 0;
        } else {
            return -1;
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }    
}

async function chores_reply(msg, choice, name, message_id) {
    const groupObj = await Basic.groupCheck(msg.chat.id, true);
    if (groupObj) {
        const reply = `You have selected ${name}
What would you like to do?
/assignme - to choose your position in the roster
/unassign - to remove someone from the roster
/init <number> - to start the chore today with the <number> being the position of the next person

/display - to show the current order
/update - to update the chores schedule to the current day, assumes no changes

/skip <number> - assumes <number> days were skipped
/swap - to swap current positions
/delete - delete this chore`;
        if (await Basic.addCallback(msg, groupObj.time_zone, JSON.stringify({choice:choice, message_id:message_id}), "choresmain")) {
            try {
                await bot.editMessageText(reply, {chat_id: msg.chat.id, message_id:message_id});
            }   
            catch(err) {
                console.log(err.message);
            }
        }
    }
    return 0;
}

async function chores_handler(msg, command, match) {
    try {
        const callbackObj = await Basic.findCallback(msg);
        if (!callbackObj || callbackObj.previous !== "choresmain") {
            return -1;
        }
        const callbackData = JSON.parse(callbackObj.data);
        async function edit_reply(code) {
            if (!code) {
                try {
                    await bot.editMessageText(`You have chosen /${command}`, {chat_id: msg.chat.id, message_id: callbackData.message_id});
                }
                catch(err) {
                    console.log(err.message);
                }
            }
            return 0;
        }
        const choice = parseInt(callbackData.choice) - 1;
        const choiceObj = await Basic.findChoice(msg);
        if(!choiceObj) {
            await bot.sendMessage(msg.chat.id, "Something went wrong");
            return -1;
        }
        const Arr = choiceObj.choices;
        if (choice < 0 || choice >= Arr.length) {
            await bot.sendMessage(msg.chat.id, 'Invalid choice');
            return -1;
        }
    
        if (command === "assignme") {
            await assign_me(msg, Arr[choice], callbackObj, callbackData).then(async val => {await edit_reply(val)});
        }
        else if (command === "order") {
            await assign_final(msg, Arr[choice], match, callbackData.message_id2);
        }
        else if (command === 'init') {
            await init_chore(msg, Arr[choice], callbackObj.time_zone, parseInt(match)).then(async val => {await edit_reply(val)});
        }
        else if (command === 'update') {
            if (Arr[choice].current.length === 0) {
                await bot.sendMessage(msg.chat.id, "Please initialise the chore using /init <position> first");
                return -1;
            }
            await algo_chores(msg, Arr[choice], callbackObj.time_zone).then(async val => {await edit_reply(val)});
        }
        else if (command === "display") {
            if (Arr[choice].current.length === 0) {
                await bot.sendMessage(msg.chat.id, "Please initialise the chore using /init <position> first");
                return -1;
            }
            await send_chores_display(msg, callbackObj.time_zone, [], Arr[choice]).then(async val => {await edit_reply(val)});
        }
        else if (command === 'skip') {
            if (Arr[choice].current.length === 0) {
                await bot.sendMessage(msg.chat.id, "Please initialise the chore using /init <position> first");
                return -1;
            }
            await skip_chores(msg, callbackObj.time_zone, Arr[choice], parseInt(match)).then(async val => {await edit_reply(val)});
        }
        else if (command === 'swap') {
            await swap_first(msg, Arr[choice]).then(async val => {await edit_reply(val)});
        }
        else if (command === 'delete') {
            await delete_chore(msg, Arr[choice], match.choice, match.message_id).then(async val => {await edit_reply(val)});
        }
        else if (command === 'unassign') {
            await unassign_roster(msg, Arr[choice]).then(async val => {await edit_reply(val)});
        }
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
} 

async function assign_me(msg, choreObj, callbackObj, callbackData) {
    const obj_id = choreObj._id;
    try {
        const temp_user = await Models.Users.findOne({from_id: msg.from.id});
        if (temp_user) {
            const curr_order = await Models.Rosters.find({chore : obj_id}).populate('user').sort('order');
            let res = curr_order.length ? "Current order is:\n" : "There is no one assigned yet\n";
            curr_order.forEach(item => {
                res += item.order + ". " + item.user.name + "\n";
            });
            res += 'Please indicate your order in the roster\nExample call: /order 1';
            const messageObj = await bot.sendMessage(msg.chat.id, "Processing...");
            callbackData.message_id2 = messageObj.message_id;
            try {
                await Models.Callbacks.updateOne(callbackObj, {data: JSON.stringify(callbackData)});
                await bot.editMessageText(res, {chat_id: msg.chat.id, message_id: messageObj.message_id});
                return 0;    
            }
            catch(err) {
                await Basic.sendError(msg.chat.id, err);
                return false;
            }
        }    
        else {
            await bot.sendMessage(msg.chat.id, "You need to register using /addme <name> first");
            return -1;
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function assign_final(msg, choreObj, order, message_id) {
    try {
        
        const [temp_user, lookup] = await Promise.all([
            Models.Users.findOne({from_id: msg.from.id}),
            Models.Rosters.findOne({chore : choreObj._id, order : order})
        ]);
        if (!lookup) {
            const new_roster = Models.Rosters({
                order : order,
                user: temp_user._id,
                chore: choreObj._id,
            });
            await new_roster.save();
            await Promise.all([
                bot.sendMessage(msg.chat.id, "You have been assigned to this chore successfully"),
                bot.editMessageText(`You have chosen ${order}`, {chat_id: msg.chat.id, message_id: message_id}),
                Basic.deleteChoice(msg),
                Basic.deleteCallback(msg),
            ]);

            return 0;
        }
        else {
            await bot.sendMessage(msg.chat.id, "This position had been taken before! Please /order with another position");
            return -1
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function unassign_roster(msg, choreObj) {
    try {
        const lookup = await Models.Rosters.find({chore: choreObj._id}).populate('user').sort('order');
        const stored = Basic.storeChoice(msg, lookup);

        let res = "Who do you want to unassign?";
        const keyboard_choices = [];
        let counter = 1;
        lookup.forEach( (item) => {
            let temp = [{text: `${item.order}. ${item.user.name}`, callback_data: JSON.stringify({previous:'unassign', choice:counter})}];
            keyboard_choices.push(temp);
            counter += 1;
        });
        keyboard_choices.push([{text: "Unassign All", callback_data: JSON.stringify({previous: "unassign", choice:0})}]);
        const opts ={
            reply_markup: {
                inline_keyboard: keyboard_choices
            } 
        };
            
        if (await stored) {
            await Promise.all([
                bot.sendMessage(msg.chat.id, res, opts),
                Basic.deleteCallback(msg)
            ]);
        }
        return 0;
    }
    catch {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function delete_roster(msg, choice, message_id) {
    try {
        const choiceArr = await Basic.findChoice(msg);
        if (choiceArr) {
            if (parseInt(choice) === 0) {
                await Models.Rosters.deleteMany({chore: choiceArr.choices[0].chore});
            }
            else {
                await Models.Rosters.deleteOne(choiceArr.choices[choice-1]);        
            }
            await Promise.all([
                Models.Chores.updateOne({_id : choiceArr.choices[0].chore}, {current: []}),
                bot.editMessageText("Unassigned successfully. Remember to use /init to restart the chore", {chat_id:msg.chat.id, message_id:message_id})
            ]);
        }
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function init_chore(msg, oneChore, time_zone, first) {
    try {
        const allRostered = await Models.Rosters.find({chore : oneChore._id}).sort('order');
        if (allRostered.length === 0) {
            bot.sendMessage(msg.chat.id, "Nobody is rostered for this chore");
            return -1;
        }
        const Arr = [];
        const rosterIndex = allRostered.findIndex(element => element.order === first);
        if (rosterIndex === -1) {
            bot.sendMessage(msg.chat.id, "There is nobody with position " + first);
            return -1;
        }
        else {
            const tempArr = allRostered.slice(rosterIndex).concat(allRostered.slice(0,rosterIndex));
            tempArr.forEach(item => {
                Arr.push(item.order);
            })
        }
        oneChore.current = Arr;
        // handle start_date.
        if (oneChore.type) {
            let dayObj = new dayjs().tz(time_zone).startOf('day')
            let today =  dayObj.isoWeekday();
            while(!oneChore.days[(today-1)%7]) {
                today += 1;
            }
            oneChore.date = dayObj.isoWeekday(today);
        }
        else {
            oneChore.date = new dayjs().tz(time_zone).startOf('day').toDate();
        }
        oneChore.next = first;
        await Models.Chores.updateOne({_id : oneChore._id}, oneChore);
        const sent = send_chores_display(msg, time_zone, [], oneChore);
        await Promise.all([
            bot.sendMessage(msg.chat.id, "Chore order has been set starting from " + first),
            Basic.deleteCallback(msg),
            Basic.deleteChoice(msg)
        ]);
        return await sent;
    }
    catch(err) {
        Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function algo_chores(msg, oneChore, time_zone) {
    let allRostered;
    try {
        allRostered = await Models.Rosters.find({chore : oneChore._id}).populate('user').sort('order');
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
    if (allRostered.length === 0 ) {
        await bot.sendMessage(msg.chat.id, "Nobody is rostered for this chore");
        return 0;
    }
    const rosterlength = allRostered.length;
    const old_date = oneChore.date;
    const daysArr = oneChore.days;
    const currArr = oneChore.current;
    const nextroster = oneChore.next;
    const currDay = new dayjs().tz(time_zone).startOf('day');
    let date_diff = (currDay.toDate() - old_date) / (1000 * 60 * 60 * 24);
    let advanced = 0;
    let remaining = 0;
    let is_less_than_roster = true;
    const newCurrArr = [];
    let to_pad = 0;
    let newNext = 0;
    if (date_diff <= 0) {
        return await send_chores_display(msg, time_zone, allRostered, oneChore);
    }
    // handle "every"
    if (!oneChore.type) {
        const everyX = daysArr[0];
        // exhaust current order...
        if (date_diff < currArr.length * everyX) {
            to_pad = date_diff % everyX === 0 ? 0 : everyX - (date_diff % everyX);
            advanced = (date_diff + to_pad) / everyX;
        }
        else { // handle for date_diff wayyy over.
            let overflow = date_diff - currArr.length * everyX;
            to_pad = overflow % everyX === 0 ? 0 : everyX - (overflow % everyX);
            overflow = overflow % (everyX * rosterlength);
            advanced = (overflow + to_pad) / everyX;
            is_less_than_roster = false;
        }

    }
    else {  /// handle specific days
        let dayofweek = currDay.isoWeekday();
        let days_work = 0;
        daysArr.forEach(item => {
            days_work += item;
        });
        // let advanced = days_work * Math.floor(date_diff / 7);
        advanced = days_work * Math.floor(date_diff / 7);
        date_diff = date_diff % 7; // find difference.
        let prev_day = new dayjs(old_date).tz(time_zone).isoWeekday();
        let i = prev_day - 1; // array index is already + 1.
        while(i !== dayofweek) {
            if (i === 7) {
                i = 0;
            }
            else {
                if (daysArr[i]) {advanced += 1;}
                i += 1;
            }
        }
        is_less_than_roster = (advanced < rosterlength);
        while(!daysArr[(i-1)%7]) {
            i += 1;
            to_pad += 1;
        }
    }
    if (is_less_than_roster) {
        let remaining = advanced;
        while(advanced < rosterlength) {
            newCurrArr.push(currArr[advanced]);
            advanced += 1;
        }

        let rosterindex = allRostered.findIndex(element => element.order === nextroster);
        while(remaining > 0) {
            newCurrArr.push(allRostered[rosterindex].order);
            if (rosterindex === rosterlength-1) {
                rosterindex = 0;
            }
            else {
                rosterindex +=1;
            }
            remaining -= 1;
        }
        newNext = allRostered[rosterindex];
    } else {
        advanced = advanced % rosterlength;  // same code as above as well!
        let rosterindex = allRostered.findIndex(element => element.order === nextroster);
        // move roster index to correct
        while(advanced > 0) {
            if(rosterindex === rosterlength-1) {
                rosterindex = 0;
            }
            else {
                rosterindex +=1;
            }
            advanced -= 1;
        }
        let remaining = rosterlength;
        while(remaining > 0) {
            newCurrArr.push(allRostered[rosterindex].order);
            if (rosterindex === rosterlength-1) {
                rosterindex = 0;
            }
            else {
                rosterindex +=1;
            }
            remaining -= 1;
        };
        newNext = allRostered[rosterindex];
    }
    
    const newDate = currDay.isoWeekday(currDay.isoWeekday() + to_pad).toDate();
    oneChore.date = newDate;
    oneChore.current = newCurrArr;
    oneChore.next = newNext.order;
    try {
        await Models.Chores.updateOne({_id : oneChore._id}, oneChore);
        return await send_chores_display(msg, time_zone, allRostered, oneChore);
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function send_chores_display(msg, time_zone, rosterArr, choreObj) {
    try {
        if (rosterArr.length === 0) {
            rosterArr = await Models.Rosters.find({chore : choreObj}).populate('user').sort('order');
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
    if (rosterArr.length === 0 ) {
        await bot.sendMessage(msg.chat.id, "Nobody is rostered for this chore");
        return 0;
    }

    let res = `*${choreObj.name}*\n`;
    let dayObj = dayjs(choreObj.date).tz(time_zone);
    const currDay = new dayjs().tz(time_zone).startOf('day');
    let i = (choreObj.date - currDay.toDate()) / (1000 * 60 * 60 * 24);
    const daysArr = choreObj.days;
    const currArr = choreObj.current;
    const rosterlength = rosterArr.length;
    const currlength = currArr.length;
    let rosterindex = rosterArr.findIndex(element => element.order === choreObj.next);
    let currindex = 0;
    let shown = 0;
    if (!choreObj.type) {  // type 0 means "every"; 
        const everyX = daysArr[0];
        while (currindex < currlength && i < 14 && shown < 8) {
            const person_name = rosterArr.find(element => element.order === currArr[currindex]).user.name;
            res += (`*${dayObj.format('ddd DD MMM')}* ${person_name}\n`);
            currindex += 1;
            i += everyX;
            shown += 1;
            dayObj = dayObj.add(everyX, 'day');
        }
        while(i < 14 && shown < 8) {
            if (rosterindex === rosterlength) {
                rosterindex = 0;
            }
            res += (`*${dayObj.format('ddd DD MMM')}* ${rosterArr[rosterindex].user.name}\n`);
            i += everyX;
            shown += 1;
            dayObj = dayObj.add(everyX, 'day');
            rosterindex += 1;
        }
        try {
            await bot.sendMessage(msg.chat.id, res, {parse_mode: 'MarkdownV2'});
        }
        catch(err) {
            await Basic.sendError(msg.chat.id, err);
            return false;
        }
        
    }
    else {
        let daysindex = dayObj.isoWeekday() - 1;
        const dayslength = daysArr.length;
        let i_prev = i;
        while (currindex < currlength && i < 14 && shown < 8) {
            if (daysindex === dayslength) {
                daysindex = 0;
            }
            if (daysArr[daysindex]) {
                const person_name = rosterArr.find(element => element.order === currArr[currindex]).user.name;
                dayObj = dayObj.add(i-i_prev, 'day');
                res += (`*${dayObj.format('ddd DD MMM')}* ${person_name}\n`);
                currindex += 1;
                i_prev = i;
                shown += 1;
            }
            i += 1;
            daysindex += 1;
        }
        while(i < 14 && shown < 8) {
            if (rosterindex === rosterlength) {
                rosterindex = 0;
            }
            if (daysindex === dayslength) {
                daysindex = 0;
            }
            if (daysArr[daysindex]) {
                dayObj = dayObj.add(i-i_prev, 'day');
                res += (`*${dayObj.format('ddd DD MMM YYYY')}* ${rosterArr[rosterindex].user.name}\n`);
                rosterindex += 1;
                i_prev = i;
                shown += 1;
            }
            i += 1;
            daysindex += 1;
        }
        try {
            await bot.sendMessage(msg.chat.id, res, {parse_mode: 'MarkdownV2'});
        }
        catch(err) {
            await Basic.sendError(msg.chat.id, err);
            return false;
        }
    }
    await Promise.all([
        Basic.deleteCallback(msg),
        Basic.deleteChoice(msg)
    ])
    return 0;
}


async function skip_chores(msg, time_zone, choreObj, choice) {
    const dateObj = new dayjs(choreObj.date).tz(time_zone);
    if (!choreObj.type) {
        const newDate = dateObj.add(choice, 'day').toDate();
        choreObj.date = newDate;
    }
    else {
        const daysArr = choreObj.days;
        let i = -1;
        let so_far = choice;
        let currIndex = dateObj.isoWeekday() - 1;
        while(so_far !== -1) {
            if (currIndex === 7) {
                currIndex = 0;
            }
            if (daysArr[currIndex]) {
                so_far -= 1;
            }
            i += 1;
            currIndex += 1;
        }
        choreObj.date = dateObj.add(i, 'day').toDate();
    }
    try {
        await Models.Chores.updateOne({_id : choreObj._id}, choreObj);
        await Promise.all([
            bot.sendMessage(msg.chat.id, "Skipped " + choice + " days"),
            Basic.deleteCallback(msg),
            Basic.deleteChoice(msg)
        ]);
        return send_chores_display(msg, time_zone, [], choreObj);
        
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function swap_first(msg, choreObj) {
    try {
        const rosterArr = await Models.Rosters.find({chore : choreObj}).populate('user').sort('order');
        const stored = Basic.storeChoice(msg, [choreObj]);
        const keyboard_choices = [];
        let res = "Please select the first person to swap with";
        choreObj.current.forEach(num => {
            const oneRoster = rosterArr.find(element => element.order === num);
            const keyboardobj = [{text : oneRoster.user.name, callback_data: JSON.stringify({previous: 'choresswap1', choice:oneRoster.order})}];
            keyboard_choices.push(keyboardobj);
        })
        
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
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function swap_second(msg, choice, message_id) {
    try {
        const stored = Basic.addCallback(msg, "", choice, "swap2");
        let choreObj = await Basic.findChoice(msg);
        choreObj = choreObj.choices[0];
        const rosterArr = await Models.Rosters.find({chore : choreObj}).populate('user').sort('order');
        const keyboard_choices = [];
        let res = "Now select the second person to swap with";
        choreObj.current.forEach(num => {
            const oneRoster = rosterArr.find(element => element.order === num);
            const keyboardobj = [{text : oneRoster.user.name, callback_data: JSON.stringify({previous: 'choresswap2', choice:oneRoster.order})}];
            keyboard_choices.push(keyboardobj);
        });
        const opts ={
            chat_id : msg.chat.id,
            message_id: message_id,
            reply_markup: {
                inline_keyboard: keyboard_choices
            } 
        };        
        if (await stored) {
            bot.editMessageText(res, opts);
        }
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function swap_finally(msg, choice, message_id) {
    try {
        const groupObj = await Basic.groupCheck(msg.chat.id, true);
        if (groupObj) {
            let [choreObj, callbackObj] = await Promise.all([Basic.findChoice(msg), Basic.findCallback(msg)]);
            const time_zone = groupObj.time_zone;
            if (callbackObj && choreObj) {
                choreObj = choreObj.choices[0];
                const prevchoice = parseInt(callbackObj.data);
                const currArr = choreObj.current;
                choice = parseInt(choice);
                const first = currArr.findIndex(num => num === prevchoice);
                const second = currArr.findIndex(num => num === choice);
                currArr[first] = choice;
                currArr[second] = prevchoice;
                await Models.Chores.updateOne({_id : choreObj._id}, choreObj);
                const sent = send_chores_display(msg, time_zone, [], choreObj);
                await Promise.all([
                    bot.editMessageText("Swapped!", {chat_id: msg.chat.id, message_id: message_id}),
                    Basic.deleteChoice(msg),
                    Basic.deleteCallback(msg)
                ]);
                return await sent;
            }
        }
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }    
}

async function delete_chore(msg, choreObj, match, message_id) {
    try {
        if (match === 'true') {
            await Promise.all([
                Models.Chores.deleteOne(choreObj),
                Models.Rosters.deleteMany({chore: choreObj._id})
            ]);
            await bot.editMessageText(choreObj.name + " has been deleted", {chat_id:msg.chat.id, message_id:message_id});
        }
        else {
            await bot.editMessageText("You selected 'No'", {chat_id:msg.chat.id, message_id:message_id});
        }
        await Promise.all([
            Basic.deleteChoice(msg),
            Basic.deleteCallback(msg)
        ]);
        return 0;
    }
    catch(err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}

async function confirm_delete(msg) {
    const opts ={
        reply_markup: {
            inline_keyboard: [
                [{text: "Yes", callback_data: JSON.stringify({previous: 'delete', choice:'true'})}],
                [{text: "No", callback_data: JSON.stringify({previous: 'delete', choice:'false'})}]
            ]
        } 
    };
    try {
        await bot.sendMessage(msg.chat.id, "Confirm deletion?", opts);
        return 0;
    }
    catch (err) {
        await Basic.sendError(msg.chat.id, err);
        return false;
    }
}




module.exports.addChore = add_chore;
module.exports.addChoredate = add_chore_date;
module.exports.choresMain = chores_main;
module.exports.choresReply = chores_reply;
module.exports.choresHandler = chores_handler;
module.exports.swapSecond = swap_second;
module.exports.swapFinally = swap_finally;
module.exports.confirmDelete = confirm_delete;
module.exports.deleteRoster = delete_roster;