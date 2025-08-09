require('dotenv').config()

const express = require('express')
const app = express()
const cors = require('cors')
const authentication = require('./middleware/authentication')
const erroHandler = require('./middleware/errorHandler')

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cors())

app.use('/api/auth', require('./routes/auth.routes'));
// app.use('/api/users', authentication, require('./routes/users.routes'));


app.use(erroHandler)

module.exports = app


