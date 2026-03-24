const express = require('express')
const router = express.Router()
const prisma = require('../db')

router.post('/', async (req, res, next) => {
    try {
        const { accountId, amount, date, merchant, rawMerchant, notes, source } = req.body
        const transaction = await prisma.transaction.create({
            data: {
                accountId,
                amount,
                date: new Date(date),
                merchant,
                rawMerchant,
                notes,
                source: source || 'csv_import'
            }
        })
        res.json(transaction)
    } catch (err) {
        next(err)
    }
})

router.get('/:accountId', async (req, res, next) => {
    try {
        const transactions = await prisma.transaction.findMany({
            where: { accountId: parseInt(req.params.accountId) },
            orderBy: { date: 'desc' }
        })
        res.json(transactions)
    } catch (err) {
        next(err)
    }
})

module.exports = router