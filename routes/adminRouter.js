const express=require('express')
const router=express.Router()
const adminController=require('../controllers/admin/adminController')
const categoryController=require('../controllers/admin/categoryController')
const brandController=require('../controllers/admin/brandController')
const userController=require('../controllers/admin/userController')
const productController=require('../controllers/admin/productController')



router.get('/login',adminController.loadlogin)
router.post('/verify',adminController.login)

//category management
router.get('/Category',categoryController.LoadCategory)
router.post('/add-category',categoryController.addCategory)
router.post('/edit-category',categoryController.editCategory)
router.patch('/delete-category/:id',categoryController.deleteCategory)
router.patch('/unlist-category/:id',categoryController.unlistCategory)
router.patch('/list-category/:id',categoryController.listCategory)

// brand management
router.get('/brand',brandController.LoadBrand)
router.post('/add-brand',brandController.addBrand)
router.post('/edit-brand',brandController.editBrand)
router.patch('/delete-brand/:id',brandController.deleteBrand)
router.patch('/unlist-brand/:id',brandController.unlistBrand)
router.patch('/list-brand/:id',brandController.listBrand)

// user management
router.get('/user',userController.LoadUser)
router.patch('/unblock-user/:id',userController.unblockUser)
router.patch('/block-user/:id',userController.blockUser)

// Product management
router.get('/product', productController.loadProduct);
router.post('/add-product', productController.addProduct);
router.get('/get-product/:id', productController.getProduct);
router.post('/edit-product', productController.editProduct);
router.patch('/delete-product/:id', productController.deleteProduct);
router.patch('/unlist-product/:id',productController.unlistProduct)
router.patch('/list-product/:id',productController.listProduct)










module.exports=router