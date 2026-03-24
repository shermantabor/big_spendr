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

app.use((err, req, res, next) => {
  console.error(err.message)
  if (err.code === 'P2002') {
    return res.status(400).json({ error: 'A record with that value already exists' })
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Referenced record does not exist' })
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' })
  }
  if (err.code === 'P2000') {
    return res.status(400).json({ error: 'Value too long for this field' })
  }
  if (err.code === 'P2011') {
    return res.status(400).json({ error: 'Required field is missing' })
  }
  if (err.code === 'P2014') {
    return res.status(400).json({ error: 'Cannot delete record that has related data' })
  }
  res.status(500).json({
    error: err.message || 'Something went wrong'
  })
})