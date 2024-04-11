import mongoose from "mongoose";
const Schema = mongoose.Schema

const groupSchema = new Schema({
    group_id: {
        type: String
    },
    users: [{type: Schema.Types.ObjectId, ref: 'user'}],
    is_first_user_ready: {
        type: Boolean,
        default: false
    },
    is_second_user_ready: {
        type: Boolean,
        default: false
    },
    game_count: {
        type: Number,
        default: 1,
    },
})

export let Group = mongoose.model('game_group', groupSchema)