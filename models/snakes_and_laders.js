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
        default: [-1, -1, -1, -1],
    },
    shifts: {
        type: [String]
    },
    is_started: {
        type: Boolean,
        default: false
    }
});

export let SnakesAndLaders = mongoose.model("snakes_and_laders", menchSchema);
