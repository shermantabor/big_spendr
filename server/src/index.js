const express = require('express')
const dotenv = require('dotenv')
const prisma = require('./db')

dotenv.config()

const app = express()
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.post('/households', async (req, res) => {
    const { name } = req.body
    const household = await prisma.household.create({
        data: { name }
    })
    res.json(household)
})

app.get('/households', async (req, res) => {
    const households = await prisma.household.findMany()
    res.json(households)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})