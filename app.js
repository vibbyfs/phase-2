if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

const express = require('express')
const app = express()
const cors = require('cors')
const multer = require('multer')

// IMPORT
const AuthController = require('./controllers/authController')
const CuisineController = require('./controllers/cuisineController')
const CategoryController = require('./controllers/categoryController')
const authentication = require('./middleware/authentication')
const authorization = require('./middleware/authorization')
const errorHandler = require('./middleware/errorHandler')
const guardAdmin = require('./middleware/guardAdmin')

// MIDDLEWARE
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cors())

// AUTH API
app.post('/login', AuthController.login)
app.post('/add-user', authentication, guardAdmin, AuthController.addUser)

// PUBLIC API
app.get('/pub/categories', CategoryController.getPubCategories)
app.get('/pub/cuisines', CuisineController.getPubCuisines)
app.get('/pub/cuisines/:id', CuisineController.getPubCuisineById)

// DATA ENTITAS UTAMA
const cuisinesRouter = express.Router()
cuisinesRouter.use(authentication)
cuisinesRouter.post('/', CuisineController.createCuisine)
cuisinesRouter.get('/', CuisineController.getCuisine)
cuisinesRouter.get('/:id', CuisineController.getCuisineById)
cuisinesRouter.put('/:id', authorization, CuisineController.updateCuisineById)
cuisinesRouter.delete('/:id', authorization, CuisineController.deleteCuisineById)

const upload = multer({ storage: multer.memoryStorage() })
cuisinesRouter.patch('/:id/cover-url', authorization, upload.single('image'), CuisineController.updateCoverCuisineById)

// DATA SUPPORT ENTITAS
const categoriesRouter = express.Router()
categoriesRouter.use(authentication)
categoriesRouter.post('/', CategoryController.createCategory)
categoriesRouter.get('/', CategoryController.getCategories)
categoriesRouter.put('/:id', CategoryController.updateCategoryBydId)

app.use('/cuisines', cuisinesRouter)
app.use('/categories', categoriesRouter)

// GLOBAL ERROR HANDLERS
app.use(errorHandler)

module.exports = app