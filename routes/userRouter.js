const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const productController=require('../controllers/user/productController')
const profileController=require('../controllers/user/profileController')
const passport = require('passport');
const {userAuth}=require('../middlewares/auth')

router.get('/', userAuth,userController.loadHomePage);
router.get('/pageNotFound', userController.pageNotFound);
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.post('/verifyOtp', userController.verifyOtp);
router.post('/resendOtp', userController.resendOtp);


router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', userAuth,userController.logout);

router.get('/forgot-password',profileController.forgetPassword)
router.post('/forgot-password',profileController.forgetPasswordsubmit)
router.post('/verifyForgetPassOtp',profileController.verifyForgetPassOtp)
router.post('/resendForgetOtp', profileController.resendForgetPassOtp); 
router.get('/reset-password',profileController.resetPass)
router.post('/reset-password',profileController.newPass)



router.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account',
}));

router.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/signup',
    failureFlash: true,
  }),
  (req, res) => {
    req.session.user = req.user._id;
    res.redirect('/');
  }
);


router.get('/shop',userAuth, userController.loadShopPage);
router.get('/productdetail', userAuth,productController.productDetailPage);

module.exports = router;