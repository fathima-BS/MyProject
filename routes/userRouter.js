const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const productController = require('../controllers/user/productController');
const profileController = require('../controllers/user/profileController');
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

module.exports = router;