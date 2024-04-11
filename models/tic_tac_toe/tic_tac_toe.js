import mongoose from "mongoose";

const Schema = mongoose.Schema;

const ticTacToeSchema = new Schema({
    first_user: {type: Schema.Types.ObjectId, ref: 'user'},
    second_user: {type: Schema.Types.ObjectId, ref: 'user', default: null},
    first_user_win_count: {
        type: Number,
        default: 0,
    },
    second_user_win_count: {
        type: Number,
        default: 0,
    },
    current_user: {
        type: String,
    },
    last_change: {
        type: Number,
        default: 0,
    },
    game_state: {
        type: [Number],
        default: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    round: {
        type: Number,
        default: 1,
    },
    game_count: {
        type: Number,
        default: 1,
    },
});

export let TicTacToe = mongoose.model("TicTacToe", ticTacToeSchema);
