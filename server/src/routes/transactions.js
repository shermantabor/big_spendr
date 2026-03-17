const express = require('express')
const router = express.Router()
const Prisma = require('../db')

router.post('/', async (req, res) => {
    const { accountId, amount, date, merchant, rawMerchant, notes, source } = req.body
    const transaction = await Prisma.transaction.create({
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
})

router.get('/:accountId', async (req, res) => {
    const transactions = await Prisma.transaction.findMany({
        where: { accountId: parseInt(req.params.accountId) },
        orderBy: { date: 'desc' }
    })
    res.json(transactions)
})

module.exports = router