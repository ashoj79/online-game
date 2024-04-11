import { JWT_PRIVATE_KEY } from "../config.js"
import { User } from "../models/user.js"
import { createHash } from 'crypto'
import pkg from 'jsonwebtoken';
const { sign, verify } = pkg;

export class UserController {
    async checkUsername(username) {
        const user = await User.findOne({ username })
        return user != null
    }

    async login(username, password){
        let user = await User.findOne({ username })
        if (user == null)
            return false

        const pass_hash = createHash('sha256').update(password).digest('hex')
        if (user.password != pass_hash)
            return false

        const token = sign({ id: user._id.toString() }, JWT_PRIVATE_KEY)
        return { token, avatar: user.profile}
    }

    async getUser({ username = '', socket_id = '', token = '' }) {
        if (username != '') {
            return await User.findOne({ username })
        } else if (socket_id != ''){
            return await User.findOne({ socket_id })
        } else {
            try {
                const decoded = verify(token, JWT_PRIVATE_KEY)
                if (typeof decoded == 'undefined') return false
                if (typeof decoded.id == 'undefined') return false

                return await User.findById(decoded.id)
            } catch (error) {
                return false
            }
        }
    }

    async createUser(username, profile, password) {
        const pass_hash = createHash('sha256').update(password).digest('hex')

        const user = User({ username, profile, password: pass_hash })
        await user.save()

        const token = sign({ id: user._id.toString() }, JWT_PRIVATE_KEY)
        
        return token
    }

    async setUserOffline(socket_id){
        const user = await User.findOne({ socket_id })
        if (user == null) return false

        user.is_online = false
        user.socket_id = ''
        await user.save()
        
        return user
    }

    async setUserOnline(token, socket_id){
        const user = await this.getUser({ token })
        if (!user) return

        user.is_online = true
        user.socket_id = socket_id
        await user.save()
    }
}