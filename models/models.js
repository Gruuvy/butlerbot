const mongoose = require('mongoose');
var Schema = mongoose.Schema;

const groupsSchema = new Schema({
    chat_id: Number,
    time_zone : String,
    name: String
})

const usersSchema = new Schema({
    from_id: Number,
    name: String,
    last_date: Date
});

const eventsSchema = new Schema({
    name: String,
    date: Date,
    chat_id: Number,
});

const rostersSchema = new Schema({
    order: Number,
    user: {type: Schema.Types.ObjectId, ref: 'users'},
    chore: {type: Schema.Types.ObjectId, ref: 'chores'}
})

const choresSchema = new Schema({
    name: String,
    chat_id: Number,
    days: [Number],
    current: [Number], // potentially number...
    date: Date,
    next: Number,
    type: Number
})

const choicesSchema = new Schema({
    chat_id: Number,
    from_id: Number,
    choices: [{ type: Schema.Types.Mixed }]
})

const callbacksSchema = new Schema({
    chat_id: Number,
    from_id: Number,
    data: String,
    previous: String,
    time_zone: String,
})

const storageSchema = new Schema({
    chat_id: Number,
    name: String,
    value: String
})

module.exports.Groups = mongoose.model('groups', groupsSchema, 'groups');
module.exports.Users = mongoose.model('users', usersSchema, 'users');
module.exports.Events = mongoose.model('events', eventsSchema, 'events');
module.exports.Chores = mongoose.model('chores', choresSchema, 'chores');
module.exports.Rosters = mongoose.model('rosters', rostersSchema, 'rosters' );
module.exports.Choices = mongoose.model('choices', choicesSchema, 'choices');
module.exports.Callbacks = mongoose.model('callbacks', callbacksSchema, 'callbacks');
module.exports.Storage = mongoose.model('storage', storageSchema, 'storage');