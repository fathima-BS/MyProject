const express=require('express')
const router=express.Router()
const adminController=require('../controllers/admin/adminController')
const {userAuth,adminAuth}=require('../middlewares/auth')
const categoryController=require('../controllers/admin/categoryController')
const brandController=require('../controllers/admin/brandController')
const userController=require('../controllers/admin/userController')
const productController=require('../controllers/admin/productController')



router.get('/login', adminController.loadlogin);
router.post('/verify', adminController.login);
router.get('/', adminAuth, adminController.loadDashboard);
router.get('/pageerror', adminController.loadErrorPage);
router.post('/logout', adminController.logout);

//category management
router.get('/Category',adminAuth,categoryController.LoadCategory)
router.post('/add-category',adminAuth,categoryController.addCategory)
router.post('/edit-category',adminAuth,categoryController.editCategory)
router.patch('/delete-category/:id',adminAuth,categoryController.deleteCategory)
router.patch('/unlist-category/:id',adminAuth,categoryController.unlistCategory)
router.patch('/list-category/:id',adminAuth,categoryController.listCategory)

// brand management
router.get('/brand',adminAuth,brandController.LoadBrand)
router.post('/add-brand',adminAuth,brandController.addBrand)
router.post('/edit-brand',adminAuth,brandController.editBrand)
router.patch('/delete-brand/:id',adminAuth,brandController.deleteBrand)
router.patch('/unlist-brand/:id',adminAuth,brandController.unlistBrand)   
router.patch('/list-brand/:id',adminAuth,brandController.listBrand)

// user management
router.get('/user',adminAuth,userController.LoadUser)
router.patch('/unblock-user/:id',adminAuth,userController.unblockUser)
router.patch('/block-user/:id',adminAuth,userController.blockUser)

// Product management
router.get('/product',adminAuth, productController.loadProduct);
router.post('/add-product',adminAuth, productController.addProduct);
router.get('/get-product/:id',adminAuth, productController.getProduct);
router.post('/edit-product',adminAuth, productController.editProduct);
router.patch('/delete-product/:id',adminAuth, productController.deleteProduct);
router.patch('/unlist-product/:id',adminAuth,productController.unlistProduct)
router.patch('/list-product/:id',adminAuth,productController.listProduct)










module.exports=router