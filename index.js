console.clear();

import http from "http";
import express from "express";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { TicTacToeController } from "./controllers/tic_tac_toe_controller.js";
import { SecretGameController } from "./controllers/secret_game_controller.js";
import { MenchController } from "./controllers/mench_controller.js";
import { UserController } from "./controllers/user_controller.js";
import { SnakesAndLadersController } from './controllers/snakes_and_laders_controller.js'
import { MENCH_GAME_TYPE, SNAKES_AND_LADERS_GAME_TYPE, TIC_TAC_TOE_GAME_TYPE } from "./config.js";
import multer from "multer";

const port = process.env.PORT || 6000;

const upload = multer()

const app = express();
const http_server = http.createServer(app);
const io = new Server(http_server);
app.use(express.urlencoded({ extended: true }))
app.use(express.json({ strict: false }))
app.use(upload.array())

const tic_tac_toe_controller = new TicTacToeController();
const mench_controller = new MenchController();
const secret_game_controller = new SecretGameController();
const user_controller = new UserController();
const snakes_and_laders_controller = new SnakesAndLadersController()

const ticTacToeNamespace = '/tictactoe'
const menchNamespace = '/mench'
const snakesAndLadersNamespace = '/snakes_and_laders'

await mongoose.connect("mongodb://127.0.0.1:27017/online_game");
mongoose.connection.once("open", () => {});

app.post('/signup', async (req, res) => {
    const username = req.body.username, profile = req.body.profile, password = req.body.password

    const isUsernameExists = await user_controller.checkUsername(username)
    if (isUsernameExists){
        res.status(400)
        res.write('کاربر دیگری با این نام کاربری ثبت نام کرده است')
        res.end()
        return
    }

    const token = await user_controller.createUser(username, profile, password)
    res.write(token)
    res.end()
})

app.post('/login', async (req, res) => {
    const username = req.body.username, password = req.body.password

    const data = await user_controller.login(username, password)
    if (!data){
        res.status(400)
        res.write('کاربری با این مشخصات یافت نشد')
        res.end()
        return
    }

    res.setHeader('Content-Type', 'application/json')
    res.write(JSON.stringify(data))
    res.end()
})

io.of(ticTacToeNamespace).on("connection", (socket) => {
    socket.on('set_me_online', async ({token}) => {
        await user_controller.setUserOnline(token, socket.id)
        socket.emit('your_are_online')
    })

    socket.on('create_group', async () => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const invite_code = await secret_game_controller.create(user, TIC_TAC_TOE_GAME_TYPE, 2)
        if (invite_code) {
            let users = await secret_game_controller.getGroupPlayers(invite_code)
            socket.emit('start_game', {
                invite_code,
                users_info: users,
                is_started: false,
                users_count: 2
            })
        }
    })

    socket.on('join_to_group', async ({code}) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await secret_game_controller.join(user, TIC_TAC_TOE_GAME_TYPE, code)
        if (!data) {
            socket.emit('group_not_found')
        } else if (data.start) {
            const game_data = await tic_tac_toe_controller.createSecretGame(data.users)
            if (game_data) {
                for (let client of data.users) {
                    io.of(ticTacToeNamespace).sockets.get(client.socket_id).join(game_data.game_id)
                }
                io.of(ticTacToeNamespace).to(game_data.game_id).emit('start_game', game_data.data)
            }
        }
    })

    socket.on("join_to_game", async () => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const clients = await secret_game_controller.delete(user)
        if(clients.length > 0) sendPlayersCount(ticTacToeNamespace, clients)
        
        const data = await tic_tac_toe_controller.createGameOrJoin(user);
        if (data) {
            socket.join(data.game_id);
            if (data.new_join) {
                io.of(ticTacToeNamespace).to(data.game_id).emit("start_game", data.data);
            } else {
                socket.emit("start_game", data.data);
            }
        }
    });

    socket.on("check_time", async () => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const result = await tic_tac_toe_controller.checkGameTime(user);
        if (result) {
            io.of(ticTacToeNamespace).to(result.game_id).emit("change_shift", {
                active_user: result.active_user,
                time: result.time,
            });
        }
    });

    socket.on("do_game", async ({ from, to }) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await tic_tac_toe_controller.doGame(user, from, to);
        if (data) 
            io.of(ticTacToeNamespace).to(data.game_id).emit("update_game", data.data);
    });

    socket.on("send_message", async ({ message_id }) => {
        if (message_id >= 1 && message_id <= 25) {
            const user = await user_controller.getUser({ socket_id: socket.id })
            const opponentSocketId = await tic_tac_toe_controller.getOpponentSocketId(user);
            if (opponentSocketId) io.of(ticTacToeNamespace).to(opponentSocketId).emit("message", message_id);
        }
    });

    socket.on("left", async () => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const opponent_socket_id = await tic_tac_toe_controller.leftUser(user);
        if (opponent_socket_id) {
            socket.emit("can_left");
            if (opponent_socket_id != 'bot')
                io.of(ticTacToeNamespace).to(opponent_socket_id).emit("left_opponent");
        }
    });

    socket.on("disconnect", async () => {
        const user = await user_controller.setUserOffline(socket.id)
        let result = await tic_tac_toe_controller.disconnectUser(user);
        if (!result) await secret_game_controller.delete(user)
    });
});


io.of(menchNamespace).on("connection", (socket) => {
    socket.on('set_me_online', async ({token}) => {
        await user_controller.setUserOnline(token, socket.id)
        socket.emit('your_are_online')
    })

    socket.on('create_group', async ({players_count}) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const invite_code = await secret_game_controller.create(user, MENCH_GAME_TYPE, players_count)
        if (invite_code) {
            let users = await secret_game_controller.getGroupPlayers(invite_code)
            socket.emit('start_game', {
                invite_code,
                users_info: users,
                is_started: false,
                users_count: players_count
            })
        }
    })

    socket.on('join_to_group', async ({code}) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await secret_game_controller.join(user, MENCH_GAME_TYPE, code)
        if (!data) {
            socket.emit('group_not_found')
        } else if (data.start) {
            const game_data = await mench_controller.createSecretGame(data)
            if (game_data) {
                for (let client of data.users) {
                    io.of(menchNamespace).sockets.get(client.socket_id).join(game_data.game_id)
                }
                io.of(menchNamespace).to(game_data.game_id).emit('start_game', game_data.data)
            }
        } else {
            sendPlayersInfo(data.users, data.players_count, data.socket_ids, menchNamespace)
        }
    })

    socket.on("join_to_game", async ({ players_count }) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await mench_controller.createGameOrJoin(user, players_count);
        if (data) {
            socket.join(data.game_id);
            if (data.send_to_group) {
                io.of(menchNamespace).to(data.game_id).emit("start_game", data.data);
            } else {
                socket.emit("start_game", data.data);
            }
        }
    });

    socket.on("check_time", async () => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const result = await mench_controller.checkGameTime(user);
        if (result)
            io.of(menchNamespace).to(result.game_id).emit("change_shift", result.data);
    });

    socket.on("do_game", async ({ moves }) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await mench_controller.doGame(user, moves);
        if (data) 
            io.of(menchNamespace).to(data.game_id).emit("update_game", data.data);
    });

    socket.on('roll_dice', async ({dice})=>{
        const user = await user_controller.getUser({ socket_id: socket.id })
        const socket_ids = await mench_controller.getOpponentSocketId(user)
        for (let socket_id of socket_ids) {
            io.of(menchNamespace).to(socket_id).emit('roll_dice', dice)
        }
    })

    socket.on("send_message", async ({ message_id }) => {
        if (message_id >= 1 && message_id <= 25) {
            const user = await user_controller.getUser({ socket_id: socket.id })
            const socket_ids = await mench_controller.getOpponentSocketId(user);
            const shift = await mench_controller.getUserShift(user)
            for (let socket_id of socket_ids) {
                io.of(menchNamespace).to(socket_id).emit("mench_message", {message_id, shift});
            }
        }
    });

    socket.on('move', async ({ from, to, piece_number }) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const opponents_socket_id = await mench_controller.getOpponentSocketId(user)
        for (let socket_id of opponents_socket_id) {
            io.of(menchNamespace).to(socket_id).emit("move", { from, to, piece_number });
        }
    });

    socket.on("left", async () => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await mench_controller.leftUser(user);
        if (data) 
            io.of(menchNamespace).to(data.game_id).emit("left_opponent", data.data);
    });

    socket.on("disconnect", async () => {
        const user = await user_controller.setUserOffline(socket.id)
        let result = await mench_controller.disconnectUser(user);
        if (result) {
            io.of(menchNamespace).to(result.game_id).emit("start_game", result.data);
        } else {
            result = await secret_game_controller.delete(user)
            if (result) {
                sendPlayersInfo(result.users, result.players_count, result.socket_ids, menchNamespace)
            }
        }
    });
});


io.of(snakesAndLadersNamespace).on("connection", (socket) => {
    socket.on('set_me_online', async ({token}) => {
        await user_controller.setUserOnline(token, socket.id)
        socket.emit('your_are_online')
    })

    socket.on('create_group', async ({players_count}) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const invite_code = await secret_game_controller.create(user, SNAKES_AND_LADERS_GAME_TYPE, players_count)
        if (invite_code) {
            let users = await secret_game_controller.getGroupPlayers(invite_code)
            socket.emit('start_game', {
                invite_code,
                users_info: users,
                is_started: false,
                users_count: players_count
            })
        }
    })

    socket.on('join_to_group', async ({code}) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await secret_game_controller.join(user, SNAKES_AND_LADERS_GAME_TYPE, code)
        if (!data) {
            socket.emit('group_not_found')
        } else if (data.start) {
            const game_data = await snakes_and_laders_controller.createSecretGame(data)
            if (game_data) {
                for (let client of data.users) {
                    io.of(snakesAndLadersNamespace).sockets.get(client.socket_id).join(game_data.game_id)
                }
                io.of(snakesAndLadersNamespace).to(game_data.game_id).emit('start_game', game_data.data)
            }
        } else {
            sendPlayersInfo(data.users, data.players_count, data.socket_ids, snakesAndLadersNamespace)
        }
    })

    socket.on("join_to_game", async ({ players_count }) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await snakes_and_laders_controller.createGameOrJoin(user, players_count);
        if (data) {
            socket.join(data.game_id);
            if (data.send_to_group) {
                io.of(snakesAndLadersNamespace).to(data.game_id).emit("start_game", data.data);
            } else {
                socket.emit("start_game", data.data);
            }
        }
    });

    socket.on("check_time", async () => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const result = await snakes_and_laders_controller.checkGameTime(user);
        if (result)
            io.of(snakesAndLadersNamespace).to(result.game_id).emit("change_shift", result.data);
    });

    socket.on("do_game", async ({ dest }) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await snakes_and_laders_controller.doGame(user, dest);
        if (data) 
            io.of(snakesAndLadersNamespace).to(data.game_id).emit("update_game", data.data);
    });

    socket.on('roll_dice', async ({dice})=>{
        const user = await user_controller.getUser({ socket_id: socket.id })
        const socket_ids = await snakes_and_laders_controller.getOpponentSocketId(user)
        for (let socket_id of socket_ids) {
            io.of(snakesAndLadersNamespace).to(socket_id).emit('roll_dice', dice)
        }
    })

    socket.on("send_message", async ({ message_id }) => {
        if (message_id >= 1 && message_id <= 25) {
            const user = await user_controller.getUser({ socket_id: socket.id })
            const socket_ids = await snakes_and_laders_controller.getOpponentSocketId(user);
            const shift = await snakes_and_laders_controller.getUserShift(user)
            for (let socket_id of socket_ids) {
                io.of(snakesAndLadersNamespace).to(socket_id).emit("mench_message", {message_id, shift});
            }
        }
    });

    socket.on('move', async ({ dest }) => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const opponents_socket_id = await snakes_and_laders_controller.getOpponentSocketId(user)
        const shift = await snakes_and_laders_controller.getUserShift(user)
        for (let socket_id of opponents_socket_id) {
            io.of(snakesAndLadersNamespace).to(socket_id).emit("move", { dest, shift });
        }
    });

    socket.on("left", async () => {
        const user = await user_controller.getUser({ socket_id: socket.id })
        const data = await snakes_and_laders_controller.leftUser(user);
        if (data) 
            io.of(snakesAndLadersNamespace).to(data.game_id).emit("left_opponent", data.data);
    });

    socket.on("disconnect", async () => {
        const user = await user_controller.setUserOffline(socket.id)
        let result = await snakes_and_laders_controller.disconnectUser(user);
        if (result) {
            io.of(snakesAndLadersNamespace).to(result.game_id).emit("start_game", result.data);
        } else {
            result = await secret_game_controller.delete(user)
            if (result) {
                sendPlayersInfo(result.users, result.players_count, result.socket_ids, snakesAndLadersNamespace)
            }
        }
    });
});

http_server.listen(port, () => {
    console.log('connect on port: '+port);
});

// setInterval(async () => {
//     let data_list = await tic_tac_toe_controller.checkShifts();
//     for (let data of data_list) {
//         io.of(ticTacToeNamespace).to(data.game_id).emit("change_shift", {
//             active_user: data.active_user,
//             time: data.time,
//         });
//     }

//     data_list = await mench_controller.checkShifts();
//     for (let data of data_list) {
//         io.of(menchNamespace).to(data.game_id).emit("change_shift", {
//             active_user: data.active_user,
//             time: data.time,
//             state: data.state
//         });
//     }

//     data_list = await backgammon_controller.checkShifts();
//     for (let data of data_list) {
//         io.of(backgammonNamespace).to(data.game_id).emit("change_shift", {
//             active_user: data.active_user,
//             time: data.time,
//             first_user_not_playing_count: data.first_user_not_playing_count,
//             second_user_not_playing_count: data.second_user_not_playing_count,
//             winner: data.winner
//         });
//     }
// }, 10000);

function sendPlayersInfo(users, users_count, socket_ids, namespace){
    for (let socket_id of socket_ids) {
        io.of(namespace).to(socket_id).emit('start_game', {
            is_started: false,
            users_info: users,
            users_count
        })
    }
}