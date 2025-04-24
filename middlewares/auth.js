const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    next();
                } else {
                    req.session.message = 'Access denied';
                    res.redirect('/login');
                }
            })
            .catch(error => {
                console.error('Error in userAuth middleware:', error);
                res.status(500).send('Internal Server Error');
            });
    } else {
        req.session.message = 'Please log in';
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
                    req.session.message = 'Unauthorized access';
                    res.redirect('/admin/login');
                }
            })
            .catch(error => {
                console.error('Error in adminAuth middleware:', error);
                req.session.message = 'Server error';
                res.redirect('/admin/login');
            });
    } else {
        req.session.message = 'Please log in';
        res.redirect('/admin/login');
    }
};

module.exports = {
    userAuth,
    adminAuth
};