const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');
const Wallet = require('../../models/walletSchema');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const Offer = require('../../models/offerSchema');
const bcrypt = require('bcrypt');

const pageNotFound = async (req, res, next) => {
  try {
    res.render('page404');
  } catch (error) {
    error.statusCode = 500;
    next(error)
  }
};

const loadSignup = async (req, res, next) => {
  try {
    const referral = req.query.referral || null;
    res.render('signup', { message: null, referral });
  } catch (error) {
    error.statusCode = 500;
    next(error)
  }
};

const loadLogin = async (req, res, next) => {
  try {
    const message = req.query.error || null;
    if (!req.session.user) {
      res.render('login', { message });
    } else {
      res.redirect('/');
    }
  } catch (error) {
    error.statusCode = 500;
    next(error)
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'WLT';
  for (let i = 0; i < 9; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const existingUser = await User.findOne({ referralCode: result });
  if (existingUser) {
    return generateCode();
  }
  return result;
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
    console.log('Email sent successfully:', info.messageId);
    return info.accepted.length > 0;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

const signup = async (req, res, next) => {
  try {
    console.log('Signup request received:', req.body);
    const { username, dateOfBirth, email, password, cPassword, referral } = req.body;
    if (!password || !cPassword) {
      console.log('Password or confirm password missing');
      return res.render('signup', { message: 'Password is required', referral });
    }
    if (password !== cPassword) {
      console.log('Passwords do not match');
      return res.render('signup', { message: 'Passwords do not match', referral });
    }
    const findUser = await User.findOne({ email });
    if (findUser) {
      console.log('User already exists with email:', email);
      return res.render('signup', { message: 'User with this email already exists', referral });
    }

    if (referral) {
      const user = await User.findOne({ referralCode: referral });
      if (!user || user.isBlocked) {
        console.log('Invalid or blocked referral code:', referral);
        return res.render('signup', { message: 'Invalid referral code', referral });
      }
      req.session.referralCode = referral;
      console.log('Referral code stored in session:', referral);
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      console.log('Failed to send verification email');
      return res.render('signup', { message: 'Error sending verification email. Please try again.', referral });
    }

    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + 60 * 1000;
    req.session.userData = { username, dateOfBirth, email, password };
    console.log('Session data stored:', { userOtp: otp, otpExpires: req.session.otpExpires, userData: req.session.userData });
    res.render('verifyOtp');
    console.log('OTP Sent:', otp);
  } catch (error) {
    error.statusCode = 500;
    next(error)
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

const verifyOtp = async (req, res, next) => {
  try {
    console.log('Verify OTP request received:', req.body);
    const { otp } = req.body;
    if (!req.session.userData) {
      console.log('Session data missing');
      return res.json({ success: false, message: 'Session expired. Please sign up again.' });
    }
    if (req.session.otpExpires && Date.now() > req.session.otpExpires) {
      console.log('OTP expired');
      return res.json({ success: false, message: 'OTP expired' });
    }

    if (otp === req.session.userOtp) {
      const { username, dateOfBirth, email, password } = req.session.userData;
      const referralCode = await generateCode();
      const passwordHash = await securePassword(password);

      const newUser = new User({
        username,
        email,
        dateOfBirth,
        password: passwordHash,
        isAdmin: false,
        referralCode,
        walletBalance: req.session.referralCode ? 500 : 0
      });
      await newUser.save();

      if (req.session.referralCode) {
        const referrer = await User.findOne({ referralCode: req.session.referralCode });

        if (referrer && !referrer.isBlocked) {
          let referrerWallet = await Wallet.findOne({ userId: referrer._id });
          if (!referrerWallet) {
            referrerWallet = new Wallet({
              userId: referrer._id,
              balance: 0,
              transactions: [],
            });
          }

          referrerWallet.balance += 1000;
          referrerWallet.transactions.push({
            amount: 1000,
            type: 'credit',
            description: `Referral bonus for referring ${newUser.email}`,
            date: new Date(),
          });

          referrer.redeemedUsers.push(newUser._id);

          let newUserWallet = await Wallet.findOne({ userId: newUser._id });
          if (!newUserWallet) {
            newUserWallet = new Wallet({
              userId: newUser._id,
              balance: 0,
              transactions: [],
            });
          }

          newUserWallet.balance += 500;
          newUserWallet.transactions.push({
            amount: 500,
            type: 'credit',
            description: `Referral bonus for using referral code ${req.session.referralCode}`,
            date: new Date(),
          });

          await Promise.all([
            referrer.save(),
            referrerWallet.save(),
            newUser.save(),
            newUserWallet.save()
          ]);
        } else {
          console.log('Invalid or blocked referrer for code:', req.session.referralCode);
        }
      }

      delete req.session.userOtp;
      delete req.session.otpExpires;
      delete req.session.userData;
      delete req.session.referralCode;
      console.log('Session cleared');

      res.json({ success: true, redirectUrl: '/login' });
    } else {
      console.log('Invalid OTP entered:', otp);
      res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
  } catch (error) {
    error.statusCode = 500;
    next(error)
  }
};

const resendOtp = async (req, res, next) => {
  try {
    const { email } = req.session.userData || {};
    if (!email) {
      console.log('No user session found, session expired');
      return res.status(400).json({ success: false, message: 'Session expired' });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      console.log('Failed to resend OTP');
      return res.status(500).json({ success: false, message: 'Failed to send resend OTP' });
    }

    req.session.userOtp = otp;
    req.session.otpExpires = Date.now() + 60 * 1000;
    console.log('Resend OTP:', otp);
    res.status(200).json({ success: true, message: 'OTP resent successfully' });
  } catch (error) {
    error.statusCode = 500;
    next(error)
  }
};



const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isAdmin: false });
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
    req.session.userData = user;
    res.redirect('/');
  } catch (error) {
    error.statusCode = 500;
    next(error)
  }
};

const loadHomePage = async (req, res, next) => {
  try {
    const userId = req.session.user;
    const userData = userId ? await User.findById(userId).lean() : null;

    const listedCategories = await Category.find({ isListed: true, isDeleted: false }).select('_id').lean();
    const listedBrands = await Brand.find({ isListed: true, isDeleted: false }).select('_id').lean();

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
      .populate('category')
      .lean();

    let productsWithOffers = products;
    if (Offer) {
      const currentDate = new Date();
      productsWithOffers = await Promise.all(products.map(async (product) => {
        const productOffer = await Offer.findOne({
          offerType: 'Product',
          applicableTo: product._id,
          isActive: true,
          validFrom: { $lte: currentDate },
          validUpto: { $gte: currentDate }
        }).lean();

        const categoryOffer = product.category ? await Offer.findOne({
          offerType: 'Category',
          applicableTo: product.category._id,
          isActive: true,
          validFrom: { $lte: currentDate },
          validUpto: { $gte: currentDate }
        }).lean() : null;

        let finalOffer = null;
        if (productOffer && categoryOffer) {
          finalOffer = productOffer.discountAmount > categoryOffer.discountAmount ? productOffer : categoryOffer;
        } else if (productOffer) {
          finalOffer = productOffer;
        } else if (categoryOffer) {
          finalOffer = categoryOffer;
        }

        const discountedPrice = finalOffer
          ? product.salePrice * (1 - finalOffer.discountAmount / 100)
          : product.salePrice;

        return {
          ...product,
          finalOffer,
          discountedPrice
        };
      }));
    }

    // Fetch wishlist
    let wishlist = null;
    if (userId) {
      wishlist = await Wishlist.findOne({ userId }).lean();
    }

    res.render('home', {
      user: userData,
      productData: productsWithOffers,
      wishlist: wishlist || { products: [] }
    });
  } catch (error) {
    console.error('Error loading home page:', error);
    error.statusCode = 500;
    next(error);
  }
};


const loadShopPage = async (req, res, next) => {
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
    };

    if (categoryf && categoryf !== 'all') {
      if (listedCategories.some(cat => cat._id.toString() === categoryf)) {
        filter.category = categoryf;
      }
    }

    if (brandf && brandf !== 'all') {
      if (listedBrands.some(brand => brand._id.toString() === brandf)) {
        filter.brand = brandf;
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
    }

    if (search && search.trim()) {
      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    let sortOptions = {};
    switch (sort) {
      case 'A-Z':
        sortOptions = { productName: 1 };
        break;
      case 'Z-A':
        sortOptions = { productName: -1 };
        break;
      case 'Price : low - high':
        sortOptions = { salePrice: 1 };
        break;
      case 'Price : high - low':
        sortOptions = { salePrice: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(perPage)
      .populate('brand')
      .populate('category')
      .lean();

    const currentDate = new Date();

    const productsWithOffers = await Promise.all(products.map(async (product) => {
      const productOffer = await Offer.findOne({
        offerType: 'Product',
        applicableTo: product._id,
        isActive: true,
        validFrom: { $lte: currentDate },
        validUpto: { $gte: currentDate }
      }).lean();

      const categoryOffer = product.category ? await Offer.findOne({
        offerType: 'Category',
        applicableTo: product.category._id,
        isActive: true,
        validFrom: { $lte: currentDate },
        validUpto: { $gte: currentDate }
      }).lean() : null;

      let finalOffer = null;
      if (productOffer && categoryOffer) {
        finalOffer = productOffer.discountAmount > categoryOffer.discountAmount ? productOffer : categoryOffer;
      } else if (productOffer) {
        finalOffer = productOffer;
      } else if (categoryOffer) {
        finalOffer = categoryOffer;
      }

      const discountedPrice = finalOffer
        ? product.salePrice * (1 - finalOffer.discountAmount / 100)
        : product.salePrice;

      return {
        ...product,
        finalOffer,
        discountedPrice
      };
    }));

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / perPage);
    const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));

    // Fetch wishlist
    let wishlist = null;
    if (userId) {
      wishlist = await Wishlist.findOne({ userId }).lean();
    }

    res.render('shop', {
      products: productsWithOffers,
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
      wishlist: wishlist || { products: [] },
      message: req.session.userMsg || null,
    });
    req.session.userMsg = null;
  } catch (error) {
    console.error('Error loading shop page:', error);
    error.statusCode = 500;
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.redirect('/');
      }
      res.redirect('/login');
    });
  } catch (error) {
    error.statusCode = 500;
    next(error)
  }
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