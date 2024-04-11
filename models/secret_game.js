import mongoose from "mongoose";
const Schema = mongoose.Schema

const secretGameSchema = new Schema({
    game_type: {
        type: String
    },
    code: {
        type: Number
    },
    players_count:{
        type: Number
    },
    users: {
        type: [{type: Schema.Types.ObjectId, ref: 'user'}]
    }
})

export let SecretGame = mongoose.model('secret_game', secretGameSchema)