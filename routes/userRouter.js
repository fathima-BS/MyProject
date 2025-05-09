const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const productController = require('../controllers/user/productController');
const profileController = require('../controllers/user/profileController');
const addressController = require('../controllers/user/addressController');
const cartController = require('../controllers/user/cartController');
const checkoutController=require('../controllers/user/checkoutController')
const orderController = require('../controllers/user/orderController'); 
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
router.post('/send-otp', userAuth, profileController.sendOtp);
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
router.get('/cart', userAuth, userController.loadCartPage);
router.post('/add', userAuth, userController.addToCart);
router.post('/increment', userAuth, userController.incrementQuantity);
router.post('/decrement', userAuth, userController.decrementQuantity);
router.post('/remove', userAuth, userController.removeItem);
router.get('/checkout', userAuth, checkoutController.loadCheckout);

// Wishlist
router.get('/wishlist', userAuth, userController.wishlist);
router.post('/wishlist/add', userAuth, userController.addToWishlist);
router.post('/wishlist/remove', userAuth, userController.removeWishlist);

// Payment
router.get('/checkout', userAuth, checkoutController.loadCheckout);
router.post('/select-address', userAuth, checkoutController.selectAddress);
router.post('/place-order', userAuth, checkoutController.placeOrder);
router.get('/order-success', userAuth, checkoutController.loadOrderSuccess);

//order
router.get('/orders',userAuth, orderController.getMyOrders);

module.exports = router;