import mongoose from "mongoose";

const Schema = mongoose.Schema;

const menchSchema = new Schema({
    users: [{type: Schema.Types.ObjectId, ref: 'user'}],
    users_count: {
        type: Number
    },
    current_user: {
        type: String
    },
    last_change: {
        type: Number,
        default: 0,
    },
    winners_count: {
        type: Number,
        default: 0,
    },
    game_state: {
        type: [Number],
        default: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    },
    shifts: {
        type: [String]
    },
    is_started: {
        type: Boolean,
        default: false
    },
    create_time: {
        type: Number
    },
    check_for_bot: {
        type: Boolean,
        default: false
    },
});

export let Mench = mongoose.model("mench", menchSchema);
