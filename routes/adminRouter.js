const express=require('express')
const router=express.Router()
const adminController=require('../controllers/admin/adminController')
const categoryController=require('../controllers/admin/categoryController')
const brandController=require('../controllers/admin/brandController')
const userController=require('../controllers/admin/userController')
const productController=require('../controllers/admin/productController');
const adminOrderController = require('../controllers/admin/adminOrderController')
const couponController=require('../controllers/admin/couponController')
const offerController = require('../controllers/admin/offerController')
const dashboardController=require('../controllers/admin/dashboardController')
const {adminAuth}=require('../middlewares/auth')
const { adminErrorHandler} = require("../middlewares/error")


router.get('/login', adminController.loadlogin);
router.post('/verify', adminController.login);
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
router.get('/orders/:id', adminAuth, adminOrderController.getOrderDetails);
router.post('/orders/:orderId/status', adminAuth, adminOrderController.updateOrderStatus);
router.get('/returnOrder', adminAuth, adminOrderController.handleReturnRequest);

// Sales Report
router.get('/SalesReport', adminAuth, adminOrderController.getSalesReport);
router.get('/downloadSalesReportPDF', adminAuth, adminOrderController.downloadSalesReportPDF);
router.get('/downloadSalesReportExcel', adminAuth, adminOrderController.downloadSalesReportExcel);

//coupon management
router.get('/coupons', adminAuth, couponController.loadCoupon);
router.post('/coupons/add', adminAuth, couponController.addCoupon);
router.post('/coupons/edit', adminAuth, couponController.editCoupon);
router.delete('/coupons/delete/:id', adminAuth, couponController.deleteCoupon);

// Offer management
router.get('/offers', adminAuth, offerController.loadOffers);
router.post('/offers/add', adminAuth, offerController.addOffer);
router.post('/offers/edit', adminAuth, offerController.editOffer);
router.delete('/offers/delete/:id', adminAuth, offerController.deleteOffer);

//dashboard
router.get('/dashboard', adminAuth, dashboardController.getDashboard);
router.get('/dashboard/data', adminAuth, dashboardController.getDashboardData);


router.use(adminErrorHandler)

module.exports=router