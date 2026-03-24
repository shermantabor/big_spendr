const express = require('express')
const router = express.Router()
const prisma = require('../db')

router.post('/', async (req, res, next) => {
    try {
        const { email, name } = req.body
        const user = await prisma.user.create({
            data: {
                email,
                name,
                passwordHash: 'placeholder'
            }
        })
        res.json(user)
    } catch (err) {
        next(err)
    }
})

router.get('/', async (req, res, next) => {
    try {
        const users = await prisma.user.findMany()
        res.json(users)
    } catch (err) {
        next(err)
    }
})

module.exports = router