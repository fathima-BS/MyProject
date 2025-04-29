const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.passport && req.session.passport.user) {
        User.findById(req.session.passport.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    next();
                } else {
                    req.session.destroy(err => {
                        if (err) {
                            console.error('Failed to clear session:', err);
                            return res.status(500).send('Internal server error');
                        }
                        res.redirect('/login');
                    });
                }
            })
            .catch(error => {
                console.error('Error in user auth:', error);
                res.status(500).send('Internal server error');
            });
    } else {
        req.session.message = 'Please login';
        res.redirect('/login');
    }
};

const adminAuth = (req, res, next) => {
    if (req.session.adminId) {
        User.findOne({ _id: req.session.adminId, isAdmin: true })
            .then(admin => {
                if (admin) {
                    req.admin = admin;
                    next();
                } else {
                    req.session.destroy(err => {
                        if (err) {
                            console.error('Failed to clear admin session:', err);
                            return res.status(500).send('Internal server error');
                        }
                        res.render('adminlogin', { message: 'Please login' });
                    });
                }
            })
            .catch(error => {
                console.error('Error in admin auth:', error);
                res.status(500).send('Internal server error');
            });
    } else {
        res.render('adminlogin', { message: 'Please login' });
    }
};

module.exports = {
    userAuth,
    adminAuth
};