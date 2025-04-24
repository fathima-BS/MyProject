const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');

const loadlogin = async (req, res) => {
    try {
        const message = req.session.message || '';
        req.session.message = null;
        res.render('adminlogin', { message });
    } catch (error) {
        console.error('Error in loadlogin:', error);
        req.session.message = 'Failed to load login page';
        res.redirect('/admin/pageerror');
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findadmin = await User.findOne({ isAdmin: true, email });
        if (!findadmin) {
            req.session.message = 'Admin not found';
            return res.redirect('/admin/login');
        }
        const passwordMatch = await bcrypt.compare(password, findadmin.password);
        if (passwordMatch) {
            req.session.adminId = findadmin._id; 
            return res.redirect('/admin');
        }
        req.session.message = 'Invalid credentials';
        return res.redirect('/admin/login');
    } catch (error) {
        console.error('Error in admin login:', error);
        req.session.message = 'Server error';
        res.redirect('/admin/pageerror');
    }
};

const loadDashboard = async (req, res) => {
    try {
        res.render('dashboard');
    } catch (error) {
        console.error('Error in loadDashboard:', error);
        req.session.message = 'Failed to load dashboard';
        res.redirect('/admin/pageerror');
    }
};

const loadErrorPage = async (req, res) => {
    try {
        const message = req.session.message || 'An unexpected error occurred';
        req.session.message = null;
        res.render('page404', { message });
    } catch (error) {
        console.error('Error in loadErrorPage:', error);
        res.status(500).send('Internal Server Error');
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
               console.log("error while logour");
               res.redirect('/page404')
               
            }
            res.redirect('/admin/login');
        });
    } catch (error) {
        console.error('Error in logout:', error);
        req.session.message = 'Failed to log out';
        res.redirect('/admin/pageerror');
    }
};

module.exports = {
    loadlogin,
    login,
    loadDashboard,
    loadErrorPage,
    logout
};