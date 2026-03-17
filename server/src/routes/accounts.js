const express = require('express')
const router = express.Router()
const prisma = require('../db')

router.post('/', async (req, res) => {
    const { name, type, institution, lastFour, householdId, createdById } = req.body
    const account = await prisma.account.create({
        data: { name, type, institution, lastFour, householdId, createdById }
    })
    res.json(account)
})

router.get('/:householdId', async (req, res) => {
    const accounts = await prisma.account.findMany({
        where: { householdId: parseInt(req.params.householdId) }
    })
    res.json(accounts)
})

module.exports = router