const User = require('../../models/userSchema')
const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const Brand = require('../../models/brandSchema')
const nodemailer = require('nodemailer')
const bcrypt = require("bcrypt")



const loadHomePage = async (req, res) => {
  try {
    let userData = null
    const user = req.session.user

    if (user) {
      userData = await User.findOne({ _id: user });
    }

    const listedCategories = await Category.find({ isListed: true, isDeleted:false }).select('_id');
    const listedBrands = await Brand.find({ isListed: true, isDeleted:false }).select('_id');


    const productData = await Product.find({
      isDeleted: false,
      isListed: true,
      quantity: { $gt: 0 },
      category: { $in: listedCategories.map(cat => cat._id) },
      brand: { $in: listedBrands.map(brand => brand._id) },
  })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('brand')


    res.render('home', {
      user: userData,
      productData
    })

  } catch (err) {
    console.log('Home page not found', err.message)
    res.status(500).send('server error')
  }
}

const loadShopPage = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findById(user) : null;
    const listedCategories = await Category.find({ isListed: true, isDeleted: false });
    const listedBrands = await Brand.find({ isListed: true, isDeleted: false });

    let { search, sort, categoryf, brandf, priceRange, page = 1 } = req.query;
    const perPage = 9;
    const skip = (page - 1) * perPage;

    // Initialize filter object
    let filter = {
      isDeleted: false,
      isListed: true,
      quantity: { $gt: 0 },
    };

    // Log query parameters for debugging
    console.log('Query Parameters:', { search, sort, categoryf, brandf, priceRange, page });

    // Add category filter
    if (categoryf && categoryf != "all") {
      const categoryExists = listedCategories.some(cat => cat._id.toString() === categoryf);
      if (categoryExists) {
        filter.category = categoryf;
        console.log(`Category filter applied: ${categoryf}`);
      } else {
        console.log(`Category ID ${categoryf} not found in listed categories`);
      }
    }

    // Add brand filter only if brandf is explicitly provided
    if (brandf && brandf !== 'all') {
      const brandExists = listedBrands.some(brand => brand._id.toString() === brandf);
      if (brandExists) {
        filter.brand = brandf;
        console.log(`Brand filter applied: ${brandf}`);
      } else {
        console.log(`Brand ID ${brandf} not found in listed brands`);
      }
    }

    // Add price range filter
    if (priceRange) {
      switch (priceRange) {
        case 'under500':
          filter.salePrice = { $lt: 500 };
          console.log('Price filter: under ₹500');
          break;
        case '500-1000':
          filter.salePrice = { $gte: 500, $lte: 1000 };
          console.log('Price filter: ₹500 - ₹1000');
          break;
        case '1000-1500':
          filter.salePrice = { $gte: 1000, $lte: 1500 };
          console.log('Price filter: ₹1000 - ₹1500');
          break;
        case 'above1500':
          filter.salePrice = { $gt: 1500 };
          console.log('Price filter: above ₹1500');
          break;
      }
    }

    // Add search filter
    if (search && search.trim()) {
      filter.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { 'brand.BrandName': { $regex: search, $options: 'i' } },
        { 'category.name': { $regex: search, $options: 'i' } },
      ];
      console.log(`Search filter applied: ${search}`);
    }

    // Log the final filter object
    console.log('Final Filter:', filter);

    // Sort options
    let sortOptions = {};
    switch (sort) {
      case '':
        sortOptions = { createdAt: -1 };
        console.log('Sort: Default (Newest)');
        break;
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
        console.log('Sort: Default (Newest) - Fallback');
    }

    // Fetch products with pagination
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(perPage)
      .populate('brand')
      .populate('category');

    // Log the number of products found
    console.log(`Products found: ${products.length}`);

    // Total count for pagination
    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / perPage);
    const currentPage = Math.max(1, Math.min(page, totalPages));

    // Fetch all categories and brands for the sidebar
    const category = await Category.find({ isListed: true, isDeleted: false });
    const brand = await Brand.find({ isListed: true, isDeleted: false });

    let message;
    if (req.session.userMsg) {
      message = req.session.userMsg;
      req.session.userMsg = null;
    }

    res.render('shop', {
      products,
      totalPages,
      currentPage,
      search: search || '',
      sort: sort || '',
      categoryf: categoryf || '',
      brandf: brandf || '',
      priceRange: priceRange || '',
      category,
      brand,
      findUser: userData,
      message,
    });
  } catch (error) {
    console.error('Error loading shop page:', error);
    res.redirect('/pageNotFound');
  }
};





const productDetailPage = async (req, res) => {
  try {
    const productId = req.query.productId;
    // Assuming you have a Product model
    const product = await Product.findById(productId).populate('brand category');
    
    if (!product) {
      return res.status(404).render('error', { message: 'Product not found' });
    }
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId },
      isListed: true,
      isDeleted: false
    })
      .populate('brand')
      .limit(4); // Limit to 4 related products
    res.render('productDetail', {
      product,
      title: product.productName,
      relatedProducts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { message: 'Server error' });
  }
};





const pageNotFound = async (req, res) => {
  try {
    res.render('page404')
  } catch (err) {
    res.redirect('/pageNotFound')
  }
}
const loadSignup = async (req, res) => {
  try {
    return res.render('signup', { message: null })
  } catch (err) {
    console.log("Home page not loading: ", err.message);
    res.status(500).send('Server Error')
  }
}


const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render('login', { message: null })
    } else {
      res.redirect('/')
    }

  } catch (err) {
    res.redirect('/pageNotFound')
  }
}

const forgetPassword = async (req, res) => {
  try {
    return res.render('forgetPassword',{message:null});
  } catch (error) {
    console.log("Forgot Password page not loading: ", error.message);
    res.status(500).render('error', { message: 'Server Error' });
  }
};

const forgetPasswordsubmit=async(req,res)=>{
  try {
    const { email } = req.body;
    
    const findUser = await User.findOne({ email });

    if (findUser) {
      const otp = generateOtp();
      const emailSent = await sendVerificationEmail(email, otp);

      if (emailSent) {
        req.session.userOtp = otp;
        req.session.email = email;
        res.render("forgotPassOtp");
        console.log("OTP:", otp);
      } else {
        res.json({ success: false, message: "Failed to send OTP. Please try again" });
      }
    } else {
      res.render("forgetPassword", {
        message: "User with this email does not exist",
      });
    }
  } catch (error) {
    res.status(500).render('error', { message: 'Server Error' });
}
}
const verifyForgetPassOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const storedOtp = req.session.userOtp;
    const email = req.session.email;

    if (!email || !storedOtp) {
      return res.json({ success: false, message: "Session expired. Please request a new OTP." });
    }

    if (otp === storedOtp) {
      // OTP is valid, proceed to password reset page
      return res.json({ success: true, redirectUrl: "/reset-password" });
    } else {
      return res.json({ success: false, message: "Invalid OTP. Please try again." });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error.message);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};



const resendForgetPassOtp = async (req, res) => {
  try {
    const email = req.session.email;

    if (!email) {
      return res.json({ success: false, message: "Session expired. Please request a new OTP." });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (emailSent) {
      req.session.userOtp = otp;
      console.log("Resent OTP:", otp);
      return res.json({ success: true });
    } else {
      return res.json({ success: false, message: "Failed to resend OTP. Please try again." });
    }
  } catch (error) {
    console.error("Error resending OTP:", error.message);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};


const resetPass = async (req, res) => {
  try {
    res.render("resetPass");
  } catch (error) {
    console.error("error while loading reset password", error.message);
    res.status(500).render('error', { message: 'Server Error' });
  }
};

const newPass = async (req, res) => {
  try {
    const { NewPassword, password } = req.body;
    const email = req.session.email;
    if (!email) {
      return res.render('resetPass', { message: 'Session expired. Please try again.' });
    }
    if (!NewPassword || !password) {
      return res.render('resetPass', { message: 'All fields are required.' });
    }
    const passwordRegex = /^(?=.*\d).{6,}$/;
    if (!passwordRegex.test(NewPassword)) {
      return res.render('resetPass', {
        message: 'Password must be at least 6 characters long and include at least one number.',
      });
    }
    if (NewPassword !== password) {
      return res.render('resetPass', { message: 'Passwords do not match.' });
    }
    const passwordHash = await bcrypt.hash(NewPassword, 10);
    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $set: { password: passwordHash } },
      { new: true }
    );
    if (!updatedUser) {
      return res.render('resetPass', { message: 'User not found.' });
    }
    delete req.session.email;
    return res.redirect('/login?passwordchanged=true');

  } catch (error) {
    console.error('Error in newPass controller:', error);
    return res.render('resetPass', { message: 'An error occurred. Please try again later.' });
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString()
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
        pass: process.env.NODEMAILER_PASSWORD
      }
    })
    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`
    })
    return info.accepted.length > 0
  } catch (error) {
    console.error("Error sending email", error)
    return false
  }
}

const signup = async (req, res) => {
  try {
    const { username, dateOfBirth, email, password, cPassword } = req.body
    if (!password && !cPassword) {
      return res.render("signup", { message: "Password is required" })
    }
    if (password !== cPassword) {
      return res.render("signup", { message: "Passwords do not match" })
    }
    const findUser = await User.findOne({ email })

    if (findUser) {
      return res.render("signup", { message: "User with this email already exits" })
    }

    const otp = generateOtp()
    const emailSent = await sendVerificationEmail(email, otp)
    if (!emailSent) {
      return res.json("email-error")
    }
    req.session.userOtp = otp
    req.session.userData = { username, dateOfBirth, email, password }
    res.render("verifyOtp")
    console.log("OTP Sent", otp)
  } catch (err) {
    console.error("signup error", err)
    res.redirect("/pageNotFound")
  }
}

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10)
    return passwordHash
  } catch (error) {

  }
}

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body
    if (otp === req.session.userOtp) {
      const user = req.session.userData
      const passwordHash = await securePassword(user.password)
      const saveUserData = new User({
        username: user.username,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        password: passwordHash
      })
      await saveUserData.save()
      req.session.user = saveUserData._id
      delete req.session.userOtp;
      delete req.session.userData

      res.json({ success: true, redirectUrl: "/login" })
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP, Please try again" })
    }

  } catch (error) {
    console.error("Error Verifying OTP", error)
    res.status(500).json({ success: false, message: "An error occured" })
  }
}

const resendOtp = async (req, res) => {
  try {
    // Check if userData exists in session
    if (!req.session.userData) {
      return res.status(400).json({ success: false, message: "User data not found in session" });
    }

    const { email } = req.session.userData;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email not found in session" });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      console.log("Resend OTP:", otp);
      return res.status(200).json({ success: true, message: "OTP resent successfully" });
    } else {
      return res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
    }
  } catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({ success: false, message: "Internal server error. Please try again." });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body
    const findUser = await User.findOne({ isAdmin: 0, email: email })

    if (!findUser) {
      return res.render("login", { message: "User not found" })
    }
    if (findUser.isBlocked) {
      return res.render('login', { message: 'User is blocked by admin' })
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password)
    if (!passwordMatch) {
      return res.render('login', { message: 'Incorrect Password' })
    }
    req.session.user = findUser._id
    res.redirect('/')

  } catch (error) {
    console.error('login error', error)
    res.render('login', { message: 'login failed.Please try again later' })
  }
}

module.exports = {
  loadHomePage,
  loadShopPage,
  productDetailPage,
  pageNotFound,
  loadSignup,
  loadLogin,
  signup,
  verifyOtp,
  resendOtp,
  login,
  forgetPassword,
  forgetPasswordsubmit,
  verifyForgetPassOtp,
  resendForgetPassOtp,
  resetPass,
  newPass

}