const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');

const loadlogin = async (req, res,next) => {
    try {
        const message = req.session.message || '';
        req.session.message = null;

        if(req.session.adminId){
            return res.redirect('/admin/dashboard')
        }

        res.render('adminlogin', { message });
    } catch (error) {
       error.statusCode=500;
       next(error)
    }
};

const login = async (req, res,next) => {
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
            return res.redirect('/admin/dashboard');
        }
        req.session.message = 'Invalid credentials';
        return res.redirect('/admin/login');
    } catch (error) {
         error.statusCode=500;
         next(error)
    }
};



const loadErrorPage = async (req, res,next) => {
    try {
        const message = req.session.message || 'An unexpected error occurred';
        req.session.message = null;
        res.render('adminPage404', { message });
    } catch (error) {
         error.statusCode=500;
         next(error)
    }
};

const logout = async (req, res,next) => {
    try {
        req.session.destroy(err => {
            if (err) {
               console.log("error while logout");
               res.redirect('/pageerror')
               
            }
            res.redirect('/admin/login');
        });
    } catch (error) {
        error.statusCode=500;
        next(error)
    }
};

module.exports = {
    loadlogin,
    login,
    loadErrorPage,
    logout
};