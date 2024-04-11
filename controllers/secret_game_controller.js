import { SecretGame as Model } from "../models/secret_game.js";

export class SecretGameController {
    async create(user, game_type, players_count) {
        const group_id = await this.#getUserGroupId(user)
        if (group_id) {
            let group = await Model.findById(group_id);
            return group.code;
        }

        do {
            var code = 10000 + Math.floor(Math.random() * 89999)
            var group = await Model.findOne({ code })
        } while (group != null);

        group = Model({
            code,
            game_type,
            players_count,
            users: [user]
        })

        await group.save()
        return code
    }

    async join(user, game_type, code) {
        const group_id = await this.#getUserGroupId(user)

        if (group_id) {
            let user_group = await Model.findById(group_id).populate('users')
            if (user_group != null) {
                return {
                    start: false,
                    users: this.#getGroupUsersInfo(user_group),
                    socket_ids: this.#getGroupUsersSocketId(user_group),
                    players_count: user_group.players_count
                }
           }
        }

        let group = await Model.findOne({ $and: [{code}, {game_type}] }).populate('users')
        if (group == null) return false

        group.users.push(user)

        if (group.users.length == group.players_count) {
            await Model.findByIdAndDelete(group._id.toString())
            return {
                start: true,
                users: group.users,
                players_count: group.players_count
            }
        }

        await group.save()
        return {
            start: false,
            users: this.#getGroupUsersInfo(group),
            socket_ids: this.#getGroupUsersSocketId(group),
            players_count: group.players_count
        }
    }

    async delete(user) {
        let group_id = await this.#getUserGroupId(user)
        if (!group_id) return false

        let group = await Model.findById(group_id).populate('users')
        if (group == null) return false

        if (group.users.length == 1) {
            await Model.findByIdAndDelete(group._id.toString())
            return false
        }

        const user_index = group.users.findIndex((info, _, __) => info.username == user.username)
        group.users.splice(user_index, 1)

        await group.save()
        return {
            players_count: group.players_count,
            users: this.#getGroupUsersInfo(group),
            socket_ids: this.#getGroupUsersSocketId(group)
        }
    }

    async getGroupPlayers(code) {
        const group = await Model.findOne({ code }).populate('users')
        return this.#getGroupUsersInfo(group)
    }

    async #getUserGroupId(user) {
        const group = await Model.findOne({ users: user });
        if (group === null) return false;
        return group._id
    }

    #getGroupUsersInfo(group) {
        let users_info = [];
        for (let i = 0; i < group.users.length; i++) {
            users_info.push({ username: group.users[i].username, profile: group.users[i].profile, shift: i + 1 });
        }
        return users_info;
    }

    #getGroupUsersSocketId(group) {
        let socket_ids = [];
        for (let u of group.users) {
            socket_ids.push(u.socket_id);
        }
        return socket_ids;
    }
}