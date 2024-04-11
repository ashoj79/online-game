import { TicTacToe as Model } from "../models/tic_tac_toe/tic_tac_toe.js";
import { PLAY_TIME_MILLISECONDS, PLAY_TIME_SECONDS } from "../config.js";

export class TicTacToeController {
    async createGameOrJoin(user) {
        let game = await this.#getUserGame(user);
        if (game !== null) {
            return {
                created: false,
                new_join: false,
                game_id: game._id.toString(),
                data: {
                    state: game.game_state,
                    users_info: this.#getUsersInfo(game),
                    first_user_win_count: game.first_user_win_count,
                    second_user_win_count: game.second_user_win_count,
                    round: game.round,
                    active_user: this.#getCurrentShift(game),
                    time: ~~((game.last_change + PLAY_TIME_MILLISECONDS - Date.now()) / 1000)
                },
            };
        }

        game = await this.#getFirstWaitingGame();
        if (game !== null) {
            game = await this.#joinUserToGame(game._id.toString(), user)
            return {
                created: false,
                new_join: true,
                game_id: game._id.toString(),
                data: {
                    state: game.game_state,
                    users_info: this.#getUsersInfo(game),
                    first_user_win_count: game.first_user_win_count,
                    second_user_win_count: game.second_user_win_count,
                    round: 1,
                    active_user: this.#getCurrentShift(game),
                    time: PLAY_TIME_SECONDS
                },
            };
        }

        game = await this.#createGame(user)
        if (!game) return false;

        return {
            created: true,
            new_join: false,
            game_id: game._id.toString(),
            data: {
                users_info: this.#getUsersInfo(game),
                is_started: false
            }
        };
    }

    async createSecretGame(group_users) {
        const game = Model({
            first_user: group_users[0],
            second_user: group_users[1],
            current_user: group_users[0]._id.toString(),
            last_change: Date.now(),
        });
        await game.save();

        const users_info = [
            {username: group_users[0].username, profile: group_users[0].profile, shift: 1},
            {username: group_users[1].username, profile: group_users[1].profile, shift: 2},
        ]
        return {
            game_id: game._id.toString(),
            data: {
                state: game.game_state,
                users_info,
                first_user_win_count: game.first_user_win_count,
                second_user_win_count: game.second_user_win_count,
                round: 1,
                active_user: this.#getCurrentShift(game),
                time: PLAY_TIME_SECONDS,
            }
        };
    }

    async isUserInGame(user) {
        const game = Model.findOne({
            $or: [{ first_user: user }, { second_user: user }]
        })
        return game != null
    }

    async #getUserGame(user) {
        const game = await Model.findOne({
            $or: [{ first_user: user }, { second_user: user }],
        }).populate(['first_user', 'second_user'])

        return game
    }

    async #getFirstWaitingGame() {
        const game = await Model.findOne({ second_user: null })
        if (game === null)
            return null

        return game
    }

    async #joinUserToGame(game_id, user) {
        await Model.findByIdAndUpdate(game_id, {
            second_user: user,
            last_change: Date.now(),
        });

        return await Model.findById(game_id).populate(['first_user', 'second_user'])
    }

    async #createGame(user) {
        const game = Model({
            first_user: user,
            current_user: user._id.toString()
        });
        await game.save();
        return game;
    }

    async disconnectUser(user) {
        const game = await Model.findOne({
            $or: [{ first_user: user }],
        }).populate(['first_user', 'second_user']);
        if (game === null) return false;

        if (game.second_user === null)
            await Model.findByIdAndRemove(game._id.toString())

        return true;
    }

    async checkGameTime(user) {
        const game = await Model.findOne({
            $or: [{ first_user: user }, { second_user: user }],
        }).populate(['first_user', 'second_user']);
        if (game === null) return false;

        if (game.last_change + PLAY_TIME_MILLISECONDS > Date.now()) return false;
        if (game.current_user === game.first_user._id.toString()) {
            game.current_user = game.second_user._id.toString();
        } else {
            game.current_user = game.first_user._id.toString();
        }
        game.last_change = Date.now();
        await game.save();

        const active_user = this.#getCurrentShift(game)

        return {
            game_id: game._id.toString(),
            active_user,
            time: PLAY_TIME_SECONDS,
        };
    }

    async doGame(user, from, to) {
        if (from < 0 || from > 9 || to < 1 || to > 9) return false;

        const game = await Model.findOne({
            $or: [{ first_user: user }, { second_user: user }],
        }).populate(['first_user', 'second_user']);
        if (game === null) return false;

        let user_symbol = -1;
        if (game.first_user.username === user.username) {
            user_symbol = 1;
        } else if (game.second_user.username === user.username) {
            user_symbol = 2;
        } else {
            return false;
        }

        let user_blocks_count = 0;
        for (const block of game.game_state) {
            if (block === user_symbol) {
                user_blocks_count++;
            }
        }

        if (from === 0 && user_blocks_count >= 3) {
            return false;
        }

        if (game.game_state[to - 1] > 0) {
            return false;
        }

        game.game_state[to - 1] = user_symbol;
        if (user_blocks_count >= 3) {
            game.game_state[from - 1] = 0;
        }
        game.last_change = Date.now();
        const isUserWin = this.#isUserWin(game.game_state, user_symbol);
        const line = isUserWin ? this.#getLineStartEndPoint(game.game_state, user_symbol) : "";
        let data = game.game_state;
        let reset = false;
        let end = false;

        if (isUserWin) {
            game.game_state = [0, 0, 0, 0, 0, 0, 0, 0, 0];
            reset = true;
            game.round += 1;
            if (user_symbol === 1) {
                game.first_user_win_count += 1;
            } else {
                game.second_user_win_count += 1;
            }
        } else {
            if (user_symbol === 1) {
                game.current_user = game.second_user._id.toString();
            } else {
                game.current_user = game.first_user._id.toString();
            }
        }

        let round = game.round;

        if (game.round > 5) {
            end = true;
            round = 0;
            await Model.findByIdAndDelete(game._id.toString());
        } else {
            await game.save();
        }

        return {
            game_id: game._id.toString(),
            data: {
                active_user: this.#getCurrentShift(game),
                data,
                reset,
                end,
                round,
                time: PLAY_TIME_SECONDS,
                line,
                first_user_win_count: game.first_user_win_count,
                second_user_win_count: game.second_user_win_count,
            },
        };
    }

    async getOpponentSocketId(user) {
        const game = await Model.findOne({
            $or: [{ first_user: user }, { second_user: user }],
        }).populate(['first_user', 'second_user']);
        if (game === null) return false;

        if (game.first_user.username === user.username) return game.second_user.socket_id;
        else return game.first_user.socket_id;
    }

    async leftUser(user) {
        const game = await Model.findOne({
            $or: [{ first_user: user }, { second_user: user }],
        }).populate(['first_user', 'second_user']);
        if (game === null) return false;

        let opponent_socket_id = "";
        if (user.username == game.first_user.username) {
            opponent_socket_id = game.second_user.socket_id;
        } else {
            opponent_socket_id = game.first_user.socket_id;
        }

        await Model.findByIdAndDelete(game._id.toString());

        return opponent_socket_id;
    }

    #isUserWin(states, user_symbol) {
        if (
            (states[0] === user_symbol && states[4] === user_symbol && states[8] === user_symbol) ||
            (states[0] === user_symbol && states[1] === user_symbol && states[2] === user_symbol) ||
            (states[0] === user_symbol && states[3] === user_symbol && states[6] === user_symbol) ||
            (states[1] === user_symbol && states[4] === user_symbol && states[7] === user_symbol) ||
            (states[2] === user_symbol && states[5] === user_symbol && states[8] === user_symbol) ||
            (states[2] === user_symbol && states[4] === user_symbol && states[6] === user_symbol) ||
            (states[3] === user_symbol && states[4] === user_symbol && states[5] === user_symbol) ||
            (states[6] === user_symbol && states[7] === user_symbol && states[8] === user_symbol)
        )
            return true;
        return false;
    }

    #getLineStartEndPoint(states, user_symbol) {
        if (states[0] === user_symbol && states[4] === user_symbol && states[8] === user_symbol)
            return "1,9";
        if (states[0] === user_symbol && states[0] === user_symbol && states[2] === user_symbol)
            return "1,3";
        if (states[0] === user_symbol && states[3] === user_symbol && states[6] === user_symbol)
            return "1,7";
        if (states[1] === user_symbol && states[4] === user_symbol && states[7] === user_symbol)
            return "2,8";
        if (states[2] === user_symbol && states[5] === user_symbol && states[8] === user_symbol)
            return "3,9";
        if (states[2] === user_symbol && states[4] === user_symbol && states[6] === user_symbol)
            return "3,7";
        if (states[3] === user_symbol && states[4] === user_symbol && states[5] === user_symbol)
            return "4,6";
        if (states[6] === user_symbol && states[7] === user_symbol && states[8] === user_symbol)
            return "7,9";
        return "";
    }

    async checkShifts() {
        const lastMinMillis = Date.now() - PLAY_TIME_MILLISECONDS;
        let data = [];
        const games = await Model.find({
            last_change: { $lt: lastMinMillis },
        }).populate(['first_user', 'second_user']);

        let active_user = 0;
        for (let game of games) {
            if (game.last_change == 0) continue

            if (game.current_user === game.first_user._id.toString()) {
                game.current_user = game.second_user._id.toString();
                active_user = 2;
            } else {
                game.current_user = game.first_user._id.toString();
                active_user = 1;
            }
            if (game.current_user > 0) {
                game.last_change = Date.now();
                await game.save();

                data.push({
                    game_id: game._id.toString(),
                    active_user,
                    time: PLAY_TIME_SECONDS,
                });
            }
        }
        return data;
    }

    #getCurrentShift(game) {
        return game.current_user === game.first_user._id.toString() ? 1 : 2;
    }

    #getUsersInfo(game) {
        let users = [
            {username: game.first_user.username, profile: game.first_user.profile, shift: 1},
        ]

        if (game.second_user != null) {
            users.push({username: game.second_user.username, profile: game.second_user.profile, shift: 2})
        }

        return users
    }
}
