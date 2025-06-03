const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Offer = require('../../models/offerSchema');
const Coupon = require('../../models/couponSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto'); // Added for signature verification

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const loadOrderSuccess = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login?error=Please login to view order success');
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).render('error', { message: 'User not found' });
    }

    const { orderId, isRetry } = req.query;
    if (!orderId) {
      return res.redirect('/cart');
    }

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product'); // Populate product details for rendering
    if (!order) {
      return res.status(404).render('page404', { message: 'Order not found' });
    }

    // Update order status for retry payments
    if (isRetry === 'true') {
      order.status = 'Pending';
      order.orderedItems.forEach((item) => {
        item.status = 'Pending';
      });

      // Update product stock
      for (const item of order.orderedItems) {
        const product = await Product.findById(item.product);
        if (product) {
          product.quantity -= item.quantity;
          if (product.quantity < 0) product.quantity = 0;
          await product.save();
        }
      }
      await order.save();
    }

    // Clear checkout-related session data to prevent stale redirects
    req.session.checkoutSummary = null;
    req.session.razorpayId = null;

    res.render('order-success', { orderId, order });
  } catch (error) {
    console.error('Error loading order success page:', error.message, error.stack);
    res.status(500).render('page404', { message: 'Unable to load order success page' });
  }
};

const paymentSuccess = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to process payment' });
    }

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      orderId
    } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !orderId) {
      return res.status(400).json({ success: false, message: 'Invalid payment details' });
    }

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Find and update the order
    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Update order details
    order.status = 'Pending';
    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpayOrderId = razorpay_order_id;
    order.orderedItems.forEach((item) => {
      item.status = 'Pending';
    });

    // Update product stock for retry payments
    for (const item of order.orderedItems) {
      const product = await Product.findById(item.product);
      if (product) {
        product.quantity -= item.quantity;
        if (product.quantity < 0) product.quantity = 0;
        await product.save();
      }
    }

    await order.save();

    // Clear session data
    req.session.checkoutSummary = null;
    req.session.razorpayId = null;

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId
    });
  } catch (error) {
    console.error('Error processing payment success:', error.message, error.stack);
    const failureOrderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await Order.findOneAndUpdate(
      { orderId: failureOrderId, userId },
      {
        status: 'Failed',
        failureReason: error.message || 'Payment verification failed',
        createdOn: new Date()
      },
      { upsert: true }
    );
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      redirect: `/payment-failure?orderId=${failureOrderId}&error=${encodeURIComponent(error.message || 'Payment verification failed')}`
    });
  }
};

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login?error=Please login to proceed to checkout');
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).render('error', { message: 'User not found' });
    }

    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: { path: 'category' }
      })
      .lean();

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    const addressDoc = await Address.findOne({ userId }).lean();
    const wallet = await Wallet.findOne({ userId }).lean(); // Fetch wallet
    const currentDate = new Date();

    let cartItems = [];
    let subtotal = 0;
    let offerDiscount = 0;
    let coupon = 0;
    let total = 0;
    let totalItems = 0;

    cartItems = await Promise.all(cart.items
      .filter(item => {
        const isValid =
          item.productId &&
          item.productId._id &&
          item.productId.salePrice != null &&
          item.productId.isListed &&
          item.productId.quantity > 0 &&
          item.quantity <= item.productId.quantity;
        if (!isValid) {
          console.log('Filtered out invalid item:', item);
        }
        return isValid;
      })
      .map(async (item) => {
        const productOffer = await Offer.findOne({
          offerType: 'Product',
          applicableTo: item.productId._id,
          isActive: true,
          validFrom: { $lte: currentDate },
          validUpto: { $gte: currentDate }
        }).lean();

        const categoryOffer = item.productId.category ? await Offer.findOne({
          offerType: 'Category',
          applicableTo: item.productId.category._id,
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

        const salePrice = Number(item.productId.salePrice);
        const quantity = Number(item.quantity) || 1;
        let discountedPrice = salePrice;
        let discountTotal = 0;

        if (finalOffer) {
          discountedPrice = salePrice * (1 - finalOffer.discountAmount / 100);
          discountTotal = (salePrice - discountedPrice) * quantity;
        }

        const saleTotal = salePrice * quantity;
        subtotal += saleTotal;
        offerDiscount += discountTotal;
        totalItems += quantity;

        return {
          ...item,
          finalOffer,
          discountedPrice,
          saleTotal,
          salePrice
        };
      }));

    if (cartItems.length === 0) {
      return res.redirect('/cart');
    }

    const shippingCost = subtotal < 2000 ? 60 : 0;

    total = (subtotal + shippingCost) - offerDiscount;
    if (cart.coupon && Number(cart.coupon.amount)) {
      coupon = Number(cart.coupon.amount) || 0;
      total -= coupon;
    }

    if (total < 0) {
      total = 0;
    }

    const walletBalance = wallet ? wallet.balance : 0; 

    res.render('checkout', {
      cart,
      cartItems,
      subtotal: subtotal.toFixed(2),
      offerDiscount: offerDiscount.toFixed(2),
      coupon: coupon.toFixed(2),
      total: total.toFixed(2),
      shippingCost: shippingCost.toFixed(2),
      totalItems,
      addresses: addressDoc || { address: [] },
      key_id: process.env.RAZORPAY_KEY_ID,
      walletBalance: walletBalance.toFixed(2) 
    });
  } catch (error) {
    console.error('Error loading checkout:', error.message, error.stack);
    res.status(500).render('page404', { message: 'Unable to load checkout page' });
  }
};

const loadPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login?error=Please login to proceed to payment');
    }

    const checkoutSummary = req.session.checkoutSummary || {};
    if (
      !checkoutSummary.cartItems ||
      checkoutSummary.cartItems.length === 0 ||
      !checkoutSummary.selectedAddress
    ) {
      return res.redirect('/cart');
    }

    res.render('payment', {
      checkoutSummary,
    });
  } catch (error) {
    console.error('Error loading payment page:', error);
    res.status(500).send('Server Error');
  }
};

const selectAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to proceed' });
    }

    const { addressIndex } = req.body;
    if (typeof addressIndex !== 'number' || addressIndex < 0) {
      return res.status(400).json({ success: false, message: 'Invalid address index' });
    }

    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc || !addressDoc.address || addressDoc.address.length === 0) {
      return res.status(404).json({ success: false, message: 'No addresses found for this user' });
    }

    if (!addressDoc.address[addressIndex]) {
      return res.status(404).json({ success: false, message: 'Address not found at the specified index' });
    }

    const selectedAddress = addressDoc.address[addressIndex];
    req.session.checkoutSummary = {
      ...req.session.checkoutSummary,
      selectedAddress,
    };
    res.json({ success: true, message: 'Address selected successfully' });
  } catch (error) {
    console.error('Error selecting address:', error);
    res.status(500).json({ success: false, message: 'Error selecting address' });
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to place order' });
    }

    const { paymentMethod } = req.body;
    if (!['COD', 'Wallet', 'OnlinePayment'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    let sum = 0
    for(let item of cart.items){
      sum += item.totalPrice
    }
    if(paymentMethod != "Wallet" && sum >= 1000){
      return res.status(400).json({success:false,message:"COD should be less than 1000  "})
    }
    console.log(sum,'sum is heere')
    const checkoutSummary = req.session.checkoutSummary || {};
    if (!checkoutSummary.selectedAddress) {
      return res.status(400).json({ success: false, message: 'Please select an address' });
    }

    const selectedAddress = checkoutSummary.selectedAddress;
    const requiredFields = ['addressType', 'name', 'phone', 'landMark', 'city', 'State', 'pincode'];
    const isValidAddress = requiredFields.every(field => selectedAddress[field] !== undefined && selectedAddress[field] !== null);
    if (!isValidAddress) {
      return res.status(400).json({ success: false, message: 'Selected address is incomplete or invalid' });
    }

    let grossTotal = 0; // Before any discounts
    let offerDiscount = 0;
    const coupon = cart.coupon && Number(cart.coupon.amount) ? Number(cart.coupon.amount) : 0;
    const currentDate = new Date();

    const orderedItems = await Promise.all(cart.items.map(async (item) => {
      const salePrice = Number(item.productId.salePrice);
      const quantity = Number(item.quantity) || 1;

      const productOffer = await Offer.findOne({
        offerType: 'Product',
        applicableTo: item.productId._id,
        isActive: true,
        validFrom: { $lte: currentDate },
        validUpto: { $gte: currentDate }
      }).lean();

      const categoryOffer = item.productId.category ? await Offer.findOne({
        offerType: 'Category',
        applicableTo: item.productId.category._id,
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

      let discountedPrice = salePrice;
      let discountPercentage = 0;

      if (finalOffer) {
        discountPercentage = finalOffer.discountAmount;
        discountedPrice = salePrice * (1 - discountPercentage / 100);
      }

      const originalTotal = salePrice * quantity;
      const discountTotal = (salePrice - discountedPrice) * quantity;

      grossTotal += originalTotal;
      offerDiscount += discountTotal;

      return {
        product: item.productId._id,
        quantity,
        originalPrice: salePrice,
        price: discountedPrice,
        discountPercentage,
        status: 'Pending',
      };
    }));

    const subtotal = Math.max(grossTotal - offerDiscount - coupon, 0); // After all discounts
    const shippingCost = grossTotal < 2000 ? 60 : 0; // Based on original total
    const finalAmount = subtotal + shippingCost;

    // Handle Wallet Payment
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        return res.status(400).json({ success: false, message: 'Wallet not found' });
      }
      if (wallet.balance < finalAmount) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }

      // Deduct from wallet
      wallet.balance -= finalAmount;
      wallet.transactions.push({
        amount: finalAmount,
        type: 'debit',
        description: `Order payment for order ID: ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        date: new Date()
      });
      await wallet.save();
    }

    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = new Order({
      orderId,
      userId,
      orderedItems,
      totalPrice: subtotal, // price after discounts
      discount: offerDiscount + coupon,
      finalAmount,
      address: selectedAddress,
      invoiceDate: new Date(),
      paymentMethod,
      status: 'Pending',
      createdOn: new Date(),
      couponApplied: coupon > 0,
      couponCode: coupon > 0 ? cart.coupon.code : null,
      shippingCost,
      paymentStatus: paymentMethod === 'Wallet' ? 'Paid' : 'Pending'
    });

    await order.save();

    for (const item of cart.items) {
      await Product.findByIdAndUpdate(item.productId._id, {
        $inc: { quantity: -item.quantity },
      });
    }

    cart.items = [];
    cart.coupon = null;
    await cart.save();

    req.session.checkoutSummary = null;

    res.json({ success: true, message: 'Order placed successfully', orderId });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ success: false, message: 'Error placing order: ' + error.message });
  }
};


const loadWallet = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      console.log('No user session found, redirecting to login');
      return res.redirect('/login');
    }

    const user = await User.findById(userId).select('username').lean();
    if (!user) {
      console.log('User not found for ID:', userId);
      return res.redirect('/login');
    }

    const wallet = await Wallet.findOne({ userId }).lean();

    if (!wallet) {
      return res.render('wallet', {
        user: {
          username: user.username,
          walletBalance: 0,
          walletTransactions: []
        }
      });
    }

    const sortedTransactions = wallet.transactions.sort((a, b) => b.date - a.date);

    res.render('wallet', {
      user: {
        username: user.username,
        walletBalance: wallet.balance,
        walletTransactions: sortedTransactions
      }
    });

  } catch (error) {
    console.error('Error loading wallet page:', error);
    res.redirect('/pageNotFound');
  }
};

const createRazorpay = async (req, res) => {
  let userId = req.session.user;

  try {
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: { path: 'category' }
      })
      .lean();

    const currentDate = new Date();
    let subtotal = 0;
    let totalItems = 0;
    let updatedItems = [];

    if (cart && cart.items && cart.items.length > 0) {
      updatedItems = await Promise.all(cart.items.map(async (item) => {
        if (!item.productId) return null;
        const productOffer = await Offer.findOne({
          offerType: 'Product',
          applicableTo: item.productId._id,
          isActive: true,
          validFrom: { $lte: currentDate },
          validUpto: { $gte: currentDate }
        }).lean();

        const categoryOffer = item.productId.category ? await Offer.findOne({
          offerType: 'Category',
          applicableTo: item.productId.category._id,
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
          ? item.productId.salePrice * (1 - finalOffer.discountAmount / 100)
          : item.productId.salePrice;

        subtotal += discountedPrice * item.quantity;
        totalItems += item.quantity;

        return {
          ...item,
          finalOffer,
          discountedPrice
        };
      }));

      updatedItems = updatedItems.filter(item => item !== null);
    }

    const shippingCost = subtotal < 2000 ? 60 : 0;
    let amount = subtotal + shippingCost;
    let amountInPaise = Math.round(amount * 100);

    console.log(cart, "cart is here");
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: 'receipt#1',
    };
    const order = await razorpay.orders.create(options);
    req.session.razorpayId = order.id;
    res.json(order);
  } catch (error) {
    console.log(error);
  }
};

const loadPaymentFailure = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login?error=Please login to view payment failure');
    }

    const { orderId, error } = req.query;

    let validatedOrderId = null;
    if (orderId) {
      const order = await Order.findOne({ orderId });
      if (order) {
        validatedOrderId = orderId;
      } else {
        console.warn(`Order with orderId ${orderId} not found for user ${userId}`);
      }
    }

    res.render('payment-failure', {
      orderId: req.session.orderid || validatedOrderId,
      error: error ? decodeURIComponent(error) : null
    });
  } catch (error) {
    console.error('Error loading payment failure page:', error);
    res.status(500).render('error', { message: 'Unable to load payment failure page' });
  }
};

const placeRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to place order' });
    }

    const { paymentMethod } = req.body;
    if (paymentMethod !== 'OnlinePayment') {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const checkoutSummary = req.session.checkoutSummary || {};
    if (!checkoutSummary.selectedAddress) {
      return res.status(400).json({ success: false, message: 'Please select an address' });
    }

    const selectedAddress = checkoutSummary.selectedAddress;
    const requiredFields = ['addressType', 'name', 'phone', 'landMark', 'city', 'State', 'pincode'];
    const isValidAddress = requiredFields.every(field => selectedAddress[field] !== undefined && selectedAddress[field] !== null);
    if (!isValidAddress) {
      return res.status(400).json({ success: false, message: 'Selected address is incomplete or invalid' });
    }

    let subtotal = 0;
    let offerDiscount = 0;
    let coupon = cart.coupon && Number(cart.coupon.amount) ? Number(cart.coupon.amount) : 0;
    const currentDate = new Date();

    const orderedItems = await Promise.all(cart.items.map(async (item) => {
      const salePrice = Number(item.price) || Number(item.productId.salePrice);
      const quantity = Number(item.quantity) || 1;

      const productOffer = await Offer.findOne({
        offerType: 'Product',
        applicableTo: item.productId._id,
        isActive: true,
        validFrom: { $lte: currentDate },
        validUpto: { $gte: currentDate }
      }).lean();

      const categoryOffer = item.productId.category ? await Offer.findOne({
        offerType: 'Category',
        applicableTo: item.productId.category._id,
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

      let discountedPrice = salePrice;
      if (finalOffer) {
        discountedPrice = salePrice * (1 - finalOffer.discountAmount / 100);
      }

      const saleTotal = salePrice * quantity;
      const discountTotal = (salePrice - discountedPrice) * quantity;
      subtotal += saleTotal;
      offerDiscount += discountTotal;

      return {
        product: item.productId._id,
        quantity,
        price: discountedPrice,
        status: 'Pending'
      };
    }));

    let total = subtotal - coupon;
    if (total < 0) total = 0;
    const shippingCost = subtotal < 2000 ? 60 : 0;
    const finalAmount = total + shippingCost;

    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = new Order({
      orderId,
      userId,
      orderedItems,
      totalPrice: subtotal,
      discount: offerDiscount + coupon,
      finalAmount,
      address: selectedAddress,
      invoiceDate: new Date(),
      paymentMethod,
      status: 'Pending',
      createdOn: new Date(),
      couponApplied: coupon > 0,
      couponCode: coupon > 0 ? cart.coupon.code : null,
      shippingCost,
      razorpayOrderId: req.session.razorpayId
    });

    const saved = await order.save();
    if (!saved) {
      return res.status(500).json({ success: false, message: 'Failed to save order' });
    }

    await Cart.findOneAndDelete({ userId });
    for (const item of order.orderedItems) {
      const productId = item.product;
      const orderedQty = item.quantity;

      const product = await Product.findById(productId);
      if (product) {
        if (product.quantity >= orderedQty) {
          product.quantity -= orderedQty;
          await product.save();
        } else {
          console.warn(`Not enough stock for product ${productId}`);
        }
      }
    }

    req.session.razorpayId = null;
    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId
    });
  } catch (error) {
    console.error('Error placing Razorpay order:', error);
    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await Order.findOneAndUpdate(
      { orderId },
      { status: 'Failed', userId, createdOn: new Date() },
      { upsert: true }
    );
    res.redirect(`/payment-failure?orderId=${orderId}&error=${encodeURIComponent(error.message || 'Error placing order. Please try again.')}`);
  }
};

const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to apply coupon' });
    }

    const { couponCode } = req.body;
    if (!couponCode) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const coupon = await Coupon.findOne({
      couponCode,
      isActive: true,
      expireOn: { $gte: new Date() },
      userId: { $nin: [userId] }
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    let subtotal = 0;
    for (const item of cart.items) {
      subtotal += Number(item.price) * Number(item.quantity);
    }

    if (subtotal < coupon.minimumPrice) {
      return res.status(400).json({
        success: false,
        message: `Minimum cart value of ₹${coupon.minimumPrice.toLocaleString("en-IN")} is required for this coupon`
      });
    }

    cart.coupon = {
      code: coupon.couponCode,
      amount: coupon.offerPrice
    };

    coupon.userId.push(userId);
    await coupon.save();
    await cart.save();

    res.json({
      success: true,
      message: 'Coupon applied successfully',
      couponAmount: coupon.offerPrice
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ success: false, message: 'Error applying coupon: ' + error.message });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to remove coupon' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(400).json({ success: false, message: 'Cart not found' });
    }

    if (!cart.coupon || !cart.coupon.code) {
      return res.status(400).json({ success: false, message: 'No coupon applied' });
    }
     const couponCode = cart.coupon.code;

    // Find the coupon by code
    const coupon = await Coupon.findOne({ couponCode });

    if (coupon) {
      // Remove user ID from coupon.userId array
      coupon.userId = coupon.userId.filter(id => id.toString() !== userId.toString());
      await coupon.save(); // Save the updated coupon
    }

    cart.coupon = { code: '', amount: 0 };
    await cart.save();

    res.json({ success: true, message: 'Coupon removed successfully' });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Error removing coupon: ' + error.message });
  }
};

const getCoupons = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to view coupons' });
    }
    const coupons = await Coupon.find({
      isActive: true,
      expireOn: { $gte: new Date() },
      userId: { $nin: [userId] }
    }).lean();
    res.json({ success: true, coupons });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ success: false, message: 'Error fetching coupons' });
  }
};

const paymentfailedorder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      error_description,
      paymentMethod
    } = req.body;

    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Get cart
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Get selected address from session
    const checkoutSummary = req.session.checkoutSummary || {};
    const selectedAddress = checkoutSummary.selectedAddress || {};

    // Validate address fields (optional)
    const requiredFields = ['addressType', 'name', 'phone', 'landMark', 'city', 'State', 'pincode'];
    const isValidAddress = requiredFields.every(field => selectedAddress[field]);

    // Prepare ordered items
    const orderedItems = cart.items.map(item => ({
      product: item.productId._id,
      quantity: item.quantity,
      price: item.price || item.productId.salePrice,
      status: 'Failed'
    }));

    // Calculate subtotal
    let subtotal = 0;
    orderedItems.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    // Save failed order
    const order = new Order({
      orderId,
      userId,
      orderedItems,
      totalPrice: subtotal,
      discount: 0,
      finalAmount: subtotal,
      address: isValidAddress ? selectedAddress : {},
      paymentMethod: paymentMethod || 'OnlinePayment',
      status: 'Failed',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      failureReason: error_description || 'Payment failed',
      createdOn: new Date()
    });
    await cart.deleteOne();
    req.session.orderid = order.orderId;
    await order.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving failed Razorpay order:', error);
    res.status(500).json({ success: false, message: 'Could not save failed order' });
  }
};

const retryPayment = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId);

        // Validate order existence
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Validate finalAmount
        if (!order.finalAmount || typeof order.finalAmount !== 'number' || order.finalAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid order amount' });
        }

        // Ensure Razorpay key is available
        if (!process.env.RAZORPAY_KEY_ID) {
            return res.status(500).json({ success: false, message: 'Razorpay key not configured' });
        }

        // Create new Razorpay order with finalAmount
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(order.finalAmount * 100), // in paise, ensure integer
            currency: 'INR',
            receipt: `retry_order_${order._id}`
        });

        // Validate Razorpay order creation
        if (!razorpayOrder || !razorpayOrder.id) {
            return res.status(500).json({ success: false, message: 'Failed to create Razorpay order' });
        }

        // Update order with new razorpayOrderId
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();

        // Send response for Razorpay popup
        res.json({
            success: true,
            razorpayOrderId: razorpayOrder.id,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            amount: order.finalAmount * 100 // Use finalAmount consistently
        });
    } catch (err) {
        console.error('Retry payment error:', err.message, err.stack);
        res.status(500).json({ success: false, message: err.message || 'Retry payment failed' });
    }
};

module.exports = {
  loadCheckout,
  loadPayment,
  selectAddress,
  placeOrder,
  loadOrderSuccess,
  loadWallet,
  createRazorpay,
  placeRazorpayOrder,
  applyCoupon,
  removeCoupon,
  getCoupons,
  loadPaymentFailure,
  paymentfailedorder,
  retryPayment,
  paymentSuccess // Export the new function
};