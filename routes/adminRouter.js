const express=require('express')
const router=express.Router()
const adminController=require('../controllers/admin/adminController')
const categoryController=require('../controllers/admin/categoryController')
const brandController=require('../controllers/admin/brandController')
const userController=require('../controllers/admin/userController')
const productController=require('../controllers/admin/productController');
const adminOrderController = require('../controllers/admin/adminOrderController')
const {adminAuth}=require('../middlewares/auth')


router.get('/login', adminController.loadlogin);
router.post('/verify', adminController.login);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/pageerror', adminController.loadErrorPage);
router.post('/logout', adminController.logout);

//category management
router.get('/category',adminAuth,categoryController.loadCategory)
router.post('/add-category',adminAuth,categoryController.addCategory)
router.post('/edit-category',adminAuth,categoryController.editCategory)
router.patch('/delete-category/:id',adminAuth,categoryController.deleteCategory)
router.patch('/unlist-category/:id',adminAuth,categoryController.unlistCategory)
router.patch('/list-category/:id',adminAuth,categoryController.listCategory)

// brand management
router.get('/brand',adminAuth,brandController.loadBrand)
router.post('/add-brand',adminAuth,brandController.addBrand)
router.post('/edit-brand',adminAuth,brandController.editBrand)
router.patch('/delete-brand/:id',adminAuth,brandController.deleteBrand)
router.patch('/unlist-brand/:id',adminAuth,brandController.unlistBrand)   
router.patch('/list-brand/:id',adminAuth,brandController.listBrand)

// user management
router.get('/user',adminAuth,userController.loadUser)
router.patch('/unblock-user/:id',adminAuth,userController.unblockUser)
router.patch('/block-user/:id',adminAuth,userController.blockUser)

// Product management
router.get('/product',adminAuth, productController.loadProduct);
router.post('/add-product',adminAuth, productController.addProduct);
router.get('/get-product/:id',adminAuth, productController.getProduct);
router.post('/edit-product',adminAuth, productController.editProduct);
router.patch('/delete-product/:id',adminAuth, productController.deleteProduct);
router.patch('/unlist-product/:id',adminAuth,productController.unlistProduct)
router.patch('/list-product/:id',adminAuth,productController.listProduct);


// Order Management Routes
router.get('/orders',adminAuth, adminOrderController.listOrders);
router.get('/orders/:orderId',adminAuth, adminOrderController.viewOrderDetails);
router.post('/orders/:orderId/status',adminAuth, adminOrderController.updateOrderStatus);
router.get('/returnOrder',adminAuth, adminOrderController.handleReturnRequest);
router.get('/returnOrder',adminAuth, adminOrderController.handleReturnRequest);

module.exports=router