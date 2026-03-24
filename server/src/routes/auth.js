const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../db')

// signup API post route
router.post('/signup', async(req, res, next) => {
    try {
        const { email, name, password } = req.body
        const passwordHash = await bcrypt.hash(password, 10)
        const user = await prisma.user.create({
            data: { email, name, passwordHash }
        })
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )
        res.json({ user, token })
    } catch (err) {
        next(err)
    }
})

// login API post route
router.post('/login', async(req, res, next) => {
    try {
        const { email, password } = req.body
        const user = await prisma.user.findUnique({
            where: { email }
        })
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }
        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            {expiresIn: '7d' }
        )
        res.json({ user, token })
    } catch (err) {
        next(err)
    }
})

module.exports = router
