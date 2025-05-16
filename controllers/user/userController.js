const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const pageNotFound = async (req, res) => {
  try {
    res.render('page404');
  } catch (err) {
    console.error('Error rendering 404 page:', err);
    res.status(500).send('Server Error');
  }
};

const loadSignup = async (req, res) => {
  try {
    res.render('signup', { message: null });
  } catch (err) {
    console.error('Error loading signup page:', err);
    res.status(500).send('Server Error');
  }
};

const loadLogin = async (req, res) => {
  try {
    const message = req.query.error || null;
    if (!req.session.user) {
      res.render('login', { message });
    } else {
      res.redirect('/');
    }
  } catch (err) {
    console.error('Error loading login page:', err);
    res.redirect('/pageNotFound');
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });
    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'Verify your account',
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`,
    });
    return info.accepted.length > 0;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

const signup = async (req, res) => {
  try {
    const { username, dateOfBirth, email, password, cPassword } = req.body;
    if (!password || !cPassword) {
      return res.render('signup', { message: 'Password is required' });
    }
    if (password !== cPassword) {
      return res.render('signup', { message: 'Passwords do not match' });
    }
    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render('signup', { message: 'User with this email already exists' });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.json({ success: false, message: 'Error sending email' });
    }

    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + 60 * 1000;
    req.session.userData = { username, dateOfBirth, email, password };
    res.render('verifyOtp');
    console.log('OTP Sent:', otp);
  } catch (err) {
    console.error('Signup error:', err);
    res.redirect('/pageNotFound');
  }
};

const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error('Error hashing password:', error);
    throw error;
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (req.session.otpExpires && Date.now() > req.session.otpExpires) {
      return res.json({ success: false, message: 'OTP expired' });
    }

    if (otp === req.session.userOtp) {
      const { username, dateOfBirth, email, password } = req.session.userData;
      const passwordHash = await securePassword(password);
      const newUser = new User({
        username,
        email,
        dateOfBirth,
        password: passwordHash,
        isAdmin: 0,
      });
      await newUser.save();

      delete req.session.userOtp;
      delete req.session.otpExpires;
      delete req.session.userData;

      res.json({ success: true, redirectUrl: '/login' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.session.userData || {};
    if (!email) {
      return res.status(400).json({ success: false, message: 'Session expired' });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({ success: false, message: 'Failed to resend OTP' });
    }

    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + 60 * 1000;
    console.log('Resend OTP:', otp);
    res.status(200).json({ success: true, message: 'OTP resent successfully' });
  } catch (error) {
    console.error('Error resending OTP:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isAdmin: 0 });
    if (!user) {
      return res.render('login', { message: 'User not found' });
    }
    if (user.isBlocked) {
      return res.render('login', { message: 'User is blocked by admin' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render('login', { message: 'Incorrect password' });
    }

    req.session.user = user._id;
    req.session.userData = user
    res.redirect('/');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { message: 'Login failed. Please try again.' });
  }
};

const loadHomePage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = userId ? await User.findById(userId).lean() : null;

    const listedCategories = await Category.find({ isListed: true, isDeleted: false }).select('_id');
    const listedBrands = await Brand.find({ isListed: true, isDeleted: false }).select('_id');

    const products = await Product.find({
      isDeleted: false,
      isListed: true,
      quantity: { $gt: 0 },
      category: { $in: listedCategories.map(cat => cat._id) },
      brand: { $in: listedBrands.map(brand => brand._id) },
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('brand')
      .lean();

    res.render('home', {
      user: userData,
      productData: products,
    });
  } catch (err) {
    console.error('Error loading home page:', err);
    res.redirect('/pageNotFound');
  }
};

const loadShopPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = userId ? await User.findById(userId).lean() : null;
    const listedCategories = await Category.find({ isListed: true, isDeleted: false }).lean();
    const listedBrands = await Brand.find({ isListed: true, isDeleted: false }).lean();

    let { search, sort, categoryf, brandf, priceRange, page = 1 } = req.query;
    const perPage = 9;
    const skip = (page - 1) * perPage;

    let filter = {
      isDeleted: false,
      isListed: true,
      quantity: { $gt: 0 },
    };

    console.log('Query Parameters:', { search, sort, categoryf, brandf, priceRange, page });

    if (categoryf && categoryf !== 'all') {
      if (listedCategories.some(cat => cat._id.toString() === categoryf)) {
        filter.category = categoryf;
        console.log(`Category filter applied: ${categoryf}`);
      }
    }

    if (brandf && brandf !== 'all') {
      if (listedBrands.some(brand => brand._id.toString() === brandf)) {
        filter.brand = brandf;
        console.log(`Brand filter applied: ${brandf}`);
      }
    }

    if (priceRange) {
      switch (priceRange) {
        case 'under500':
          filter.salePrice = { $lt: 500 };
          break;
        case '500-1000':
          filter.salePrice = { $gte: 500, $lte: 1000 };
          break;
        case '1000-1500':
          filter.salePrice = { $gte: 1000, $lte: 1500 };
          break;
        case 'above1500':
          filter.salePrice = { $gt: 1500 };
          break;
      }
      console.log(`Price filter applied: ${priceRange}`);
    }

    if (search && search.trim()) {
      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
      console.log(`Search filter applied: ${search}`);
    }

    console.log('Final Filter:', filter);

    let sortOptions = {};
    switch (sort) {
      case 'A-Z':
        sortOptions = { productName: 1 };
        console.log('Sort: A-Z');
        break;
      case 'Z-A':
        sortOptions = { productName: -1 };
        console.log('Sort: Z-A');
        break;
      case 'Price : low - high':
        sortOptions = { salePrice: 1 };
        console.log('Sort: Price low to high');
        break;
      case 'Price : high - low':
        sortOptions = { salePrice: -1 };
        console.log('Sort: Price high to low');
        break;
      default:
        sortOptions = { createdAt: -1 };
        console.log('Sort: Newest');
    }

    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(perPage)
      .populate('brand')
      .populate('category')
      .lean();

    console.log(`Products found: ${products.length}`);

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / perPage);
    const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));

    res.render('shop', {
      products,
      totalPages,
      currentPage,
      search: search || '',
      sort: sort || '',
      categoryf: categoryf || '',
      brandf: brandf || '',
      priceRange: priceRange || '',
      category: listedCategories,
      brand: listedBrands,
      findUser: userData,
      message: req.session.userMsg || null,
    });
    req.session.userMsg = null;
  } catch (error) {
    console.error('Error loading shop page:', error);
    res.redirect('/pageNotFound');
  }
};







const logout = async (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.redirect('/');
    }
    res.redirect('/login');
  });
};

module.exports = {
  loadHomePage,
  loadShopPage,
  pageNotFound,
  loadSignup,
  loadLogin,
  logout,
  signup,
  verifyOtp,
  resendOtp,
  login
};