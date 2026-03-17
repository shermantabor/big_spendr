const express = require('express')
const router = express.Router()
const Prisma = require('../db')

router.post('/', async (req, res) => {
    const { email, name } = req.body
    const user = await Prisma.user.create({
        data: {
            email,
            name,
            passwordHash: 'placeholder'
        }
    })
    res.json(user)
})

router.get('/', async (req, res) => {
    const users = await Prisma.user.findMany()
    res.json(users)
})

module.exports = router