const express = require('express')
const router = express.Router()
const prisma = require('../db')

router.post('/', async (req, res, next) => {
    try{
        const { name } = req.body
        const household = await prisma.household.create({
            data: { name }
        })
        res.json(household)
    } catch (err) {
        next(err)
    }
})

router.get('/', async (req, res, next) => {
    try{
        const households = await prisma.household.findMany()
        res.json(households)
    } catch (err) {
        next(err)
    }
})

module.exports = router