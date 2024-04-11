import { Mench as Model } from "../models/mench/mench.js";
import { PLAY_TIME_MILLISECONDS, PLAY_TIME_SECONDS } from "../config.js";

export class MenchController {
    async createGameOrJoin(user, users_count) {
        var game = await this.#getUserGame(user);
        if (game !== null) {
            return {
                send_to_group: false,
                game_id: game._id.toString(),
                data: {
                    state: game.game_state,
                    users_info: this.#getGameUsersInfo(game),
                    active_user: this.#getCurrentShift(game),
                    is_started: game.is_started,
                    users_count: game.users_count,
                    time: ~~((game.last_change + PLAY_TIME_MILLISECONDS - Date.now()) / 1000),
                    coins: 0,
                },
            };
        }

        game = await this.#getFirstWaitingGame(users_count);
        if (game !== null) {
            game = await this.#joinUserToGame(game._id.toString(), user);
            if (!game) return false;
            return {
                send_to_group: true,
                game_id: game._id.toString(),
                data: {
                    state: game.game_state,
                    users_info: this.#getGameUsersInfo(game),
                    active_user: this.#getCurrentShift(game),
                    is_started: game.is_started,
                    users_count: game.users_count,
                    time: PLAY_TIME_SECONDS,
                    coins: this.game_coin_count,
                },
            };
        }

        game = await this.#createGame(user, users_count);
        if (!game) return false;

        return {
            send_to_group: false,
            game_id: game._id.toString(),
            data: {
                state: game.game_state,
                users_info: this.#getGameUsersInfo(game),
                active_user: this.#getCurrentShift(game),
                is_started: game.is_started,
                users_count: game.users_count,
                time: PLAY_TIME_SECONDS,
                coins: this.game_coin_count,
            },
        };
    }

    async createSecretGame(group) {
        const shifts = []
        for (let i = 0; i < group.users.length; i++) 
            shifts.push(group.users[i].username)

        const game = Model({
            users: group.users,
            is_started: true,
            shifts,
            users_count: group.players_count,
            current_user: group.users[0]._id.toString(),
            last_change: Date.now(),
        });
        await game.save();
        
        return {
            game_id: game._id.toString(),
            data: {
                state: game.game_state,
                users_info: this.#getGameUsersInfo(game),
                is_started: true,
                users_count: game.users_count,
                active_user: this.#getCurrentShift(game),
                time: PLAY_TIME_SECONDS,
                coins: this.game_coin_count,
            }
        };
    }

    async isUserInGame(user) {
        const game = Model.findOne({ users: user });
        return game != null;
    }

    async #getUserGame(user) {
        const game = await Model.findOne({ users: user }).populate('users');
        return game;
    }

    async #getFirstWaitingGame(users_count) {
        const game = await Model.findOne({
            $and: [{ is_started: false }, { users_count }]
        }).populate('users');

        if (game === null)
            return null;

        return game
    }

    async #joinUserToGame(game_id, user) {
        const game = await Model.findById(game_id).populate('users')

        game.users.push(user)
        game.shifts.push(user.username)

        if (game.users.length == game.users_count) {
            game.is_started = true
            game.last_change = Date.now()
        }

        await game.save()
        return game;
    }

    async #createGame(user, users_count) {
        const game = Model({
            users: [user],
            shifts: [user.username],
            users_count,
            current_user: user._id.toString(),
            create_time: Date.now()
        });

        await game.save();
        return game;
    }

    async disconnectUser(user) {
        const game = await Model.findOne({ users: user }).populate('users');
        if (game === null) return false;

        if (!game.is_started) {
            const user_index = game.users.findIndex((info, _, __) => info.username == user.username);
            game.users.splice(user_index, 1);
            game.shifts.splice(user_index, 1);
            if (game.users.length == 0){
                await Model.findByIdAndDelete(game._id.toString())
                return false
            }
            await game.save();

            return {
                send: true,
                game_id: game._id.toString(),
                data: {
                    users_info: this.#getGameUsersInfo(game),
                    is_started: false,
                }
            };
        }

        return { send: false };
    }

    async checkGameTime(user) {
        const game = await Model.findOne({ users: user }).populate('users');
        if (game === null) return false;

        if (game.last_change + PLAY_TIME_MILLISECONDS > Date.now()) return false;

        const next_user_index = this.#getNextUserIndex(game)
        game.current_user = game.users[next_user_index]._id.toString()
        game.last_change = Date.now();
        await game.save();

        return {
            game_id: game._id.toString(),
            data: {
                active_user: this.#getCurrentShift(game),
                state: game.game_state,
                time: PLAY_TIME_SECONDS,
            }
        };
    }

    async checkShifts() {
        const lastMinMillis = Date.now() - (PLAY_TIME_MILLISECONDS + 2000);
        let data = [];
        const games = await Model.find({
            last_change: { $lt: lastMinMillis },
        }).populate(['users']);

        for (let game of games) {
            if (game.last_change == 0) continue

            let active_user_index = this.#getNextUserIndex(game)
            game.current_user = game.users[active_user_index]._id.toString()

            if (game.current_user > 0) {
                game.last_change = Date.now();
                await game.save();

                let active_user = this.#getCurrentShift(game)

                data.push({
                    game_id: game._id.toString(),
                    active_user,
                    state: game.game_state,
                    time: PLAY_TIME_SECONDS,
                });
            }
        }
        return data;
    }

    async doGame(user, moves) {
        const game = await Model.findOne({ users: user }).populate('users');
        if (game === null) return false

        if (game.current_user != user._id.toString()) return false

        let user_shift = -1
        let user_index = -1
        for (let i = 0; i < game.users.length; i++) {
            if (game.users[i].username == user.username) {
                user_index = i
            }
        }

        for (let i = 0; i < game.shifts.length; i++) {
            if (game.shifts[i] == user.username) {
                user_shift = i + 1
            }
        }

        const user_pieces = []
        if (user_shift == 1) {
            user_pieces.push(1, 2, 3, 4)
        } else if (user_shift == 2) {
            user_pieces.push(5, 6, 7, 8)
        } else if (user_shift == 3) {
            user_pieces.push(9, 10, 11, 12)
        } else if (user_shift == 4) {
            user_pieces.push(13, 14, 15, 16)
        } else {
            return false;
        }

        for (let move of moves) {
            if (move.from < -1 || move.from > 64 || move.to < -1 || move.to > 64) {
                return false;
            }
            if (move.from == -1) {
                if ((user_shift == 1 && move.to != 42) || (user_shift == 2 && move.to != 20) || (user_shift == 3 && move.to != 9) || (user_shift == 4 && move.to != 31)) {
                    return false;
                }
            } else if (move.to > -1 && game.game_state[move.from] != move.piece_number) {
                return false;
            }

            if (move.to > -1) {
                if (user_pieces.includes(game.game_state[move.to])) {
                    return false;
                }

                game.game_state[move.to] = move.piece_number
            } 

            if (move.from > -1 && move.to > -1) {
                game.game_state[move.from] = 0
            }
        }

        const is_win = this.#isUserWin(game.game_state, user_shift)
        let winners = [];
        let end = false

        if (is_win) {
            winners.push({ username: user.username, rank: game.winners_count + 1 })
            game.winners_count += 1

            if (game.users.length == 2) {
                end = true

                if (game.winners_count < game.users_count - 1) {
                    let opponent_username = user.username == game.users[0].username ? game.users[1].username : game.users[0].username
                    winners.push({ username: opponent_username, rank: game.winners_count })
                }
                await Model.findByIdAndDelete(game._id.toString())
            } else {
                const user_index = game.users.findIndex((info, _, __) => info.username == user.username);
                game.users.splice(user_index, 1)
            }
        }

        if (!end) {
            const next_user_index = is_win ? user_index : this.#getNextUserIndex(game)
            game.current_user = game.users[next_user_index]._id.toString()
            game.last_change = Date.now();
            await game.save();
        }

        return {
            game_id: game._id.toString(),
            data: {
                active_user: this.#getCurrentShift(game),
                winners,
                end,
                time: PLAY_TIME_SECONDS,
                state: game.game_state
            },
        };
    }

    async getOpponentSocketId(user) {
        const game = await Model.findOne({ users: user }).populate('users');
        if (game === null) return [];

        const socket_ids = []
        for (let u of game.users) {
            if (u.username != user.username) {
                socket_ids.push(u.socket_id)
            }
        }

        return socket_ids
    }

    async getUserShift(user) {
        const game = await Model.findOne({ users: user }).populate('users');
        if (game === null) return 0;

        for (let i = 0; i < game.shifts.length; i++) {
            if (game.shifts[i] == user.username) 
                return i + 1
        }

        return 0
    }

    async leftUser(user) {
        const game = await Model.findOne({ users: user }).populate('users');
        if (game === null) return false;

        const winners = []
        const user_index = game.users.findIndex((info, _, __) => info.username == user.username);
        game.users.splice(user_index, 1)

        if (game.users.length == 1) {
            winners.push({ username: game.users[0].username, rank: game.winners_count + 1 })
            await Model.findByIdAndDelete(game._id.toString())
        } else {
            await game.save()
        }

        return {
            game_id: game._id.toString(),
            data: {
                left: user.username,
                winners
            }
        }
    }

    #getNextUserIndex(game) {
        let current_index = -1
        for (let i = 0; i < game.users.length; i++) {
            if (game.current_user == game.users[i]._id.toString()) {
                current_index = i
            }
        }

        if (current_index + 1 == game.users.length) return 0

        return current_index + 1
    }

    #isUserWin(state, user_index) {
        if (user_index == 1 && state[44] > 0 && state[45] > 0 && state[46] > 0 && state[47] > 0) return true;
        if (user_index == 2 && state[48] > 0 && state[49] > 0 && state[50] > 0 && state[51] > 0) return true;
        if (user_index == 3 && state[52] > 0 && state[53] > 0 && state[54] > 0 && state[55] > 0) return true;
        if (user_index == 4 && state[56] > 0 && state[57] > 0 && state[58] > 0 && state[59] > 0) return true;
        return false
    }

    #getCurrentShift(game) {
        for (let i = 0; i < game.users.length; i++) {
            if (game.users[i]._id.toString() == game.current_user) {
                return i + 1
            }
        }
    }

    #getGameUsersInfo(game) {
        let users_info = [];
        for (let u of game.users) {
            const shift = game.shifts.findIndex((un, _, __) => un == u.username) + 1;
            users_info.push({ username: u.username, profile: u.profile, shift });
        }
        return users_info;
    }
}
