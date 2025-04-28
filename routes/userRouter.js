const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const passport = require('passport');

router.get('/', userController.loadHomePage);
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.get('/pageNotFound', userController.pageNotFound);

router.get('/forgot-password',userController.forgetPassword)
router.post('/forgot-password',userController.forgetPasswordsubmit)
router.post('/verifyForgetPassOtp',userController.verifyForgetPassOtp)
router.get('/reset-password',userController.resetPass)
router.post('/reset-password',userController.newPass)




router.post('/resendForgetOtp', userController.resendForgetPassOtp); 



router.post('/verifyOtp', userController.verifyOtp);
router.post('/resendOtp', userController.resendOtp);

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

router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      return res.redirect('/');
    }
    res.redirect('/login');
  });
});

router.get('/shop', userController.loadShopPage);
router.get('/productdetail', userController.productDetailPage);

module.exports = router;