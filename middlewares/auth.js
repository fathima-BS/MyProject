const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data) {
                    if (data.isBlocked) {
                        req.session.destroy(err => {
                            if (err) {
                                console.log("Error destroying session:", err);
                            }
                            res.render('login', { message: 'You are blocked. Please contact support.' });
                        });
                    } else {
                        res.locals.user = data; 
                        next();
                    }
                } else {
                    req.session.destroy(err => {
                        if (err) {
                            console.log("Error destroying session:", err);
                        }
                        res.render('login', { message: 'User not found. Please sign up again.' });
                    });
                }
            })
            .catch((error) => {
                console.log("Error in user auth:", error);
                res.status(500).send('Internal server error');
            });
    } else {
        res.render('login', { message: 'Please login to continue' });
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