const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Offer = require('../../models/offerSchema');
const Coupon = require('../../models/couponSchema');
const Razorpay = require('razorpay');

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
        populate: { path: 'category' } // Populate category for Category offers
      })
      .lean();

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    const addressDoc = await Address.findOne({ userId }).lean();
    const currentDate = new Date();

    let cartItems = [];
    let subtotal = 0;
    let offerDiscount = 0;
    let coupon = 0;
    let total = 0;
    let totalItems = 0;

    // Process cart items with offer logic
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
        // Fetch offers for the product
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
        }).lean() : null; // Fixed syntax error here

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
    });
  } catch (error) {
    console.error('Error loading checkout:', error.message, error.stack);
    res.status(500).render('error', { message: 'Unable to load checkout page' });
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
        if (paymentMethod !== 'COD') {
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

        // Validate the selected address
        const selectedAddress = checkoutSummary.selectedAddress;
        const requiredFields = ['addressType', 'name', 'phone', 'landMark', 'city', 'State', 'pincode'];
        const isValidAddress = requiredFields.every(field => selectedAddress[field] !== undefined && selectedAddress[field] !== null);
        if (!isValidAddress) {
            return res.status(400).json({ success: false, message: 'Selected address is incomplete or invalid' });
        }

        // Calculate totals
        let subtotal = 0;
        let offerDiscount = 0;
        let coupon = cart.coupon && Number(cart.coupon.amount) ? Number(cart.coupon.amount) : 0;
        const currentDate = new Date();

        const orderedItems = await Promise.all(cart.items.map(async (item) => {
            const salePrice = Number(item.price) || Number(item.productId.salePrice);
            const quantity = Number(item.quantity) || 1;

            // Fetch offers for the product
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
                price: discountedPrice, // Use discounted price for order
                status: 'Pending',
            };
        }));

        // Apply coupon discount
        let total = subtotal - coupon;
        if (total < 0) total = 0;

        // Calculate shipping cost based on subtotal (before coupon discount)
        const shippingCost = subtotal < 2000 ? 60 : 0;

        // Calculate final amount (total after coupon + shipping cost)
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
            shippingCost
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

    const { orderId } = req.query;
    if (!orderId) {
      return res.redirect('/cart');
    }

    const order = await Order.findOne({ orderId: orderId, userId }).lean();
    if (!order) {
      return res.status(404).render('error', { message: 'Order not found' });
    }

    res.render('order-success', { orderId });
  } catch (error) {
    console.error('Error loading order success page:', error.message, error.stack);
    res.status(500).render('page404', { message: 'Unable to load order success page' });
  }
};

const loadWallet = async (req, res) => {
    try {
        const userId = req.session.user;

        const wallet = await Wallet.findOne({ userId });

        res.render('wallet', {
            wallet: wallet || { balance: 0 },
        });
    } catch (error) {
        console.error('Error loading wallet page:', error);
        res.status(500).send('Server Error');
    }
};

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createRazorpay = async(req,res)=>{
    let userId = req.session.user
  
    try {
          const cart = await Cart.findOne({ userId })
          .populate({
            path: 'items.productId',
            populate: { path: 'category' } // Populate category for Category offers
          })
          .lean();
    
        const currentDate = new Date();
        let subtotal = 0;
        let totalItems = 0;
        let updatedItems = [];
    
        if (cart && cart.items && cart.items.length > 0) {
          updatedItems = await Promise.all(cart.items.map(async (item) => {
            if (!item.productId) return null; // Skip invalid items
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
    
          // Filter out null items
          updatedItems = updatedItems.filter(item => item !== null);
        }
    
        // Calculate shipping cost: ₹60 if subtotal < ₹2000, otherwise ₹0
        const shippingCost = subtotal < 2000 ? 60 : 0;
        let amount = subtotal + shippingCost
        let amountInPaise = Math.round(amount * 100);

        console.log(cart,"cart is heae")
        const options = {
        amount:amountInPaise, // amount in paise (₹500)
        currency: 'INR',
        receipt: 'receipt#1',
    };
     const order = await razorpay.orders.create(options);
     req.session.razorpayId = order.id
     res.json(order);
    } catch (error) {
        console.log(error)
    }
}

// const placeRazorpayOrder = async(req,res)=>{
//     try {
//         console.log('hi helodsafdsaf')
//     } catch (error) {
//         console.log(error)
//     }
// }
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
            console.log(req.session.checkoutSummary,'summary fathima')
        const checkoutSummary = req.session.checkoutSummary || {};
        if (!checkoutSummary.selectedAddress) {
            return res.status(400).json({ success: false, message: 'Please select an address' });
        }

        // Validate address
        const selectedAddress = checkoutSummary.selectedAddress;
        const requiredFields = ['addressType', 'name', 'phone', 'landMark', 'city', 'State', 'pincode'];
        const isValidAddress = requiredFields.every(field => selectedAddress[field] !== undefined && selectedAddress[field] !== null);
        if (!isValidAddress) {
            return res.status(400).json({ success: false, message: 'Selected address is incomplete or invalid' });
        }

        // Calculate totals
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
                status: 'Pending',
            };
        }));

        // Calculate totals
        let total = subtotal - coupon;
        if (total < 0) total = 0;
        const shippingCost = subtotal < 2000 ? 60 : 0;
        const finalAmount = total + shippingCost;

        const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`

        // Save order temporarily to DB (optional) or handle after payment success
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
            shippingCost,
            razorpayOrderId:req.session.razorpayId // Save this to verify later
        });

       const saved = await order.save();
       if(saved){
        await Cart.findOneAndDelete({ userId });
            for (const item of order.orderedItems) {
                const productId = item.product;
                const orderedQty = item.quantity;

                const product = await Product.findById(productId);
                if (product) {
                    // Optional: check stock
                    if (product.quantity >= orderedQty) {
                        product.quantity -= orderedQty;
                        await product.save();
                    } else {
                        console.warn(`Not enough stock for product ${productId}`);
                    }
                }
            }

       }

        // Don't clear cart yet – do it after payment success
        res.json({
            success: true,
            message: 'Razorpay order created',
            orderId,
            razorpayOrderId: req.session.razorpayId,
            amount: finalAmount,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Error placing Razorpay order:', error);
        res.status(500).json({ success: false, message: 'Error placing Razorpay order: ' + error.message });
    }
};

// ammu
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
      userId: { $nin: [userId] } // Ensure user hasn't used this coupon
    });

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Calculate subtotal to check minimumPrice
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

    // Apply coupon to cart
    cart.coupon = {
      code: coupon.couponCode,
      amount: coupon.offerPrice
    };

    // Mark coupon as used by this user
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

    // Remove coupon from cart
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
      userId: { $nin: [userId] } // Exclude coupons already used by the user
    }).lean();
    res.json({ success: true, coupons });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ success: false, message: 'Error fetching coupons' });
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
    // ammu
    applyCoupon,
    removeCoupon,
    getCoupons
};