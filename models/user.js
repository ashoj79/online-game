import mongoose from "mongoose";

const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: {
        type: String,
    },
    is_online: {
        type: Boolean,
        default: false,
    },
    socket_id: {
        type: String,
        default: ''
    },
    profile: {
        type: Number
    },
    password: {
        type: String
    }
});

export let User = mongoose.model("user", userSchema);
