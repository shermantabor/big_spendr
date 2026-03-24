const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../db')

// signup API post route
router.post('/signup', async(req, res, next) => {
    try {
        const { email, name, password, householdName, inviteCode } = req.body
        const passwordHash = await bcrypt.hash(password, 10)
        const user = await prisma.user.create({
            data: { email, name, passwordHash }
        })

        let household
        let role = 'owner'

        if (inviteCode) {
            // joining an existing household via invite link
            household = await prisma.household.findUnique({
                where: { inviteCode }
            })
            if (!household) {
                return res.status(400).json({ error: 'Invalid invite code' })
            }
            role = 'member'
        } else {
            // creating a new household (or individual -- household of 1)
            household = await prisma.household.create({
                data: { name: householdName || '${name}\'s Household'}
            })
        }

        await prisma.householdMember.create({
            data: { userId: user.id, householdId: household.id, role }
        })

        const token = jwt.sign(
            { userId: user.id, householdId: household.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.json({ user, household, token })
        } catch (err) {
            next(err)
        }
})

// login API post route
router.post('/login', async(req, res, next) => {
    try {
        const { email, password } = req.body
        const user = await prisma.user.findUnique({
            where: { email },
            include: { households: { include: { household:true } } }
        })
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }
        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }
        const household = user.households[0]?.household

        const token = jwt.sign(
            { userId: user.id, householdId: household.id  },
            process.env.JWT_SECRET,
            {expiresIn: '7d' }
        )
        res.json({ user, household, token })
        } catch (err) {
            next(err)
        }
})

router.get('/invite/:householdId', async (req, res, next) => {
    try {
        const household = await prisma.household.findUnique({
            where: { id: parseInt(req.params.householdId) }
    })
    if (!household) {
        return res.status(404).json({ error: 'Household not found' })
    }
    res.json({ invideCode: household.inviteCode })
    } catch (err) {
        next(err)
    }
})

module.exports = router
