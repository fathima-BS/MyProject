const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data) {
                    next();
                } else {
                    res.redirect('/login');
                }
            })
            .catch((error) => {
                console.log("error in user auth");
                res.status(500).send('internal server error');
            });
    } else {
        req.session.message = 'please login';
        res.redirect('/login');
    }
};

const adminAuth = (req, res, next) => {
    const data = req.session.adminId;
    if (data) {
        next();
    } else {
        res.render('adminlogin', { message: 'please login' });
    }
};

module.exports = {
    userAuth,
    adminAuth
};