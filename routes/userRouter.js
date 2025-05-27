const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const productController = require('../controllers/user/productController');
const profileController = require('../controllers/user/profileController');
const addressController = require('../controllers/user/addressController');
const cartController = require('../controllers/user/cartController');
const checkoutController=require('../controllers/user/checkoutController')
const orderController = require('../controllers/user/orderController'); 
const wishlistController=require('../controllers/user/wishlistController')
const passport = require('passport');
const { userAuth } = require('../middlewares/auth');

router.get('/', userController.loadHomePage);
router.get('/pageNotFound', userController.pageNotFound);
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.post('/verifyOtp', userController.verifyOtp);
router.post('/resendOtp', userController.resendOtp);

router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', userController.logout);

router.get('/forgot-password', profileController.forgetPassword);
router.post('/forgot-password', profileController.forgetPasswordsubmit);
router.post('/verifyForgetPassOtp', profileController.verifyForgetPassOtp);
router.post('/resendForgetOtp', profileController.resendForgetPassOtp);
router.get('/reset-password', profileController.resetPass);
router.post('/reset-password', profileController.newPass);

router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
}));

router.get("/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", (err, user, info) => {
        if (err) return next(err);

        if (!user) {
            const message = info?.message || 'Google login failed';
            return res.redirect(`/login?error=${encodeURIComponent(message)}`);
        }

        req.logIn(user, (err) => {
            if (err) return next(err);
            req.session.user = req.user._id;
            return res.redirect("/");
        });
    })(req, res, next);
});

// Shop and Product 
router.get('/shop', userAuth, userController.loadShopPage);
router.get('/product/:id', userAuth, productController.productDetailPage);

// Profile routes
router.get('/userProfile', userAuth, profileController.loadUserProfile);
router.post('/update-phone', userAuth, profileController.PhoneNo);
router.get('/edit-profile', userAuth, profileController.loadEditProfile);
router.post('/edit-profile', userAuth, profileController.editProfile);

router.get('/change-email',userAuth,profileController.changeEmail)
router.post('/change-email',userAuth,profileController.sendOtp)
router.post('/resend-otp',userAuth, profileController.resendOtp);
router.get('/verify-otp', userAuth, profileController.getVerifyOtp);
router.post('/verify-otp', userAuth, profileController.verifyOtp);

router.post('/update-password', userAuth, profileController.postNewPassword);

// Address
router.get('/addresses', userAuth, addressController.loadAddress);
router.post('/add-address', userAuth, addressController.addAddress);
router.post('/edit-address', userAuth, addressController.editAddress);
router.get('/delete-address', userAuth, addressController.deleteAddress);
router.post('/deliver-address', userAuth, addressController.deliverAddress);

// Cart 
router.get('/cart', userAuth, cartController.loadCartPage)
router.post('/add', userAuth, cartController.addToCart)
router.post('/increment', userAuth, cartController.incrementQuantity)
router.post('/decrement', userAuth, cartController.decrementQuantity)
router.post('/remove', userAuth, cartController.removeItem)

//wallet
router.get('/wallet',userAuth,checkoutController.loadWallet)

// Wishlist
router.get('/wishlist', userAuth, wishlistController.wishlist)
router.post('/wishlist/add', userAuth, wishlistController.addToWishlist)
router.post('/wishlist/remove', userAuth, wishlistController.removeWishlist)

// Checkout
router.get('/checkout', userAuth, checkoutController.loadCheckout);
router.post('/select-address', userAuth, checkoutController.selectAddress);
router.post('/place-order', userAuth, checkoutController.placeOrder);
router.get('/order-success', userAuth, checkoutController.loadOrderSuccess);
router.post('/apply-coupon', userAuth,checkoutController.applyCoupon)
router.post('/remove-coupon', userAuth,checkoutController.removeCoupon)
router.get('/coupons', userAuth, checkoutController.getCoupons);

//order
router.get('/orders',userAuth, orderController.getMyOrders);
router.get('/order-details/:id',userAuth, orderController.orderDetails)
router.post('/cancelItem',userAuth, orderController.cancelItem) 
router.post('/returnItem',userAuth,orderController.returnItem)
router.post('/cancelOrder', userAuth, orderController.cancelOrder)
router.post('/returnOrder', userAuth, orderController.returnOrder)

//razorpay 

router.post('/createRazorpay',userAuth,checkoutController.createRazorpay)
router.post('/razorpayPlaceOrder',userAuth,checkoutController.placeRazorpayOrder)

router.get('/payment-failure', userAuth, checkoutController.loadPaymentFailure);

// New route for referral
router.post('/generate-referral-code', userAuth, profileController.generateReferralCode);



module.exports = router;