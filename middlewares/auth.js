const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    const publicRoutes = ['/', '/login', '/register', '/auth/google', '/auth/google/callback']; // Include Google auth routes

    // Allow access to public routes without authentication
    if (publicRoutes.includes(req.path)) {
        if (req.session.passport && req.session.passport.user) {
            User.findById(req.session.passport.user)
                .then(user => {
                    if (user && !user.isBlocked) {
                        next();
                    } else {
                        req.session.destroy(err => {
                            if (err) {
                                console.error('Failed to clear session:', err);
                                return res.status(500).json({ error: 'Internal server error' });
                            }
                            console.log('User session terminated due to block or invalid status');
                            res.redirect('/login');
                        });
                    }
                })
                .catch(error => {
                    console.error('Authentication error:', error);
                    res.status(500).json({ error: 'Internal server error' });
                });
        } else {
            next();
        }
    } else {
        // Require authentication for protected routes
        if (req.session.passport && req.session.passport.user) {
            User.findById(req.session.passport.user)
                .then(user => {
                    if (user && !user.isBlocked) {
                        next();
                    } else {
                        req.session.destroy(err => {
                            if (err) {
                                console.error('Session termination error:', err);
                                return res.status(500).json({ error: 'Internal server error' });
                            }
                            console.log('Access denied: User session removed');
                            res.redirect('/login');
                        });
                    }
                })
                .catch(error => {
                    console.error('User verification error:', error);
                    res.status(500).json({ error: 'Internal server error' });
                });
        } else {
            res.redirect('/login');
        }
    }
};

const adminAuth = (req, res, next) => {
    if (req.session.adminId) {
        User.findOne({ _id: req.session.adminId, isAdmin: true })
            .then(admin => {
                if (admin) {
                    req.admin = admin; // Attach admin object to request
                    next();
                } else {
                    req.session.destroy(err => {
                        if (err) {
                            console.error('Failed to clear admin session:', err);
                            return res.status(500).json({ error: 'Internal server error' });
                        }
                        console.log('Admin session terminated due to invalid status');
                        res.redirect('/admin/login');
                    });
                }
            })
            .catch(error => {
                console.error('Admin authentication error:', err);
                res.status(500).json({ error: 'Internal server error' });
            });
    } else {
        res.redirect('/admin/login');
    }
};

module.exports = {
    userAuth,
    adminAuth
};