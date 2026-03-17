const express = require('express')
const dotenv = require('dotenv')

dotenv.config()

const app = express()
app.use(express.json())

app.use('/users', require('./routes/users'))
app.use('/households', require('./routes/households'))
app.use('/accounts', require('./routes/accounts'))
app.use('/transactions', require('./routes/transactions'))

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})