const express = require('express')
const router = express.Router()
const prisma = require('../db')

router.post('/', async (req, res, next) => {
    try {
        const { name, type, institution, lastFour, householdId, createdById } = req.body
        const account = await prisma.account.create({
            data: { name, type, institution, lastFour, householdId, createdById }
        })
        res.json(account)
    } catch (err) {
        next(err)
    }
})

router.get('/:householdId', async (req, res, next) => {
    try{
        const accounts = await prisma.account.findMany({
            where: { householdId: parseInt(req.params.householdId) }
        })
        res.json(accounts)
    } catch (err) {
        next(err)
    }
})

module.exports = router