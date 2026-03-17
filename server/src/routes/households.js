const express = require('express')
const router = express.Router()
const prisma = require('../db')

router.post('/', async (req, res) => {
    const { name } = req.body
    const household = await prisma.household.create({
        data: { name }
    })
    res.json(household)
})

router.get('/', async (req, res) => {
    const households = await prisma.household.findMany()
    res.json(households)
})

module.exports = router