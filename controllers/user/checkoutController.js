const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema')

const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login?error=Please login to proceed to checkout');
        }

        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        let cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        const addressDoc = await Address.findOne({ userId }).lean();

        let cartItems = [];
        let subtotal = 0;
        let offerDiscount = 0;
        let coupon = 0;
        let total = 0;
        let totalItems = 0;

        cartItems = cart.items
            .filter(item => {
                const isValid =
                    item.productId &&
                    item.productId._id &&
                    item.productId.salePrice != null &&
                    item.productId.isListed &&
                    item.productId.quantity > 0 &&
                    item.quantity <= item.productId.quantity &&
                    item.price != null &&
                    item.totalPrice != null;
                if (!isValid) {
                    console.log('Filtered out invalid item:', item);
                }
                return isValid;
            })
            .map(item => {
                const salePrice = Number(item.price) || Number(item.productId.salePrice);
                const regularPrice = Number(item.productId.regularPrice) || salePrice;
                const quantity = Number(item.quantity) || 1;

                const totalPrice = salePrice * quantity;
                subtotal += totalPrice;
                offerDiscount += (regularPrice - salePrice) * quantity;
                totalItems += quantity;

                return {
                    ...item.toObject(),
                    totalPrice,
                };
            });

        if (cartItems.length !== cart.items.length) {
            cart.items = cartItems;
            await cart.save();
        }

        if (cartItems.length === 0) {
            return res.redirect('/cart');
        }

        total = subtotal;
        if (cart.coupon && Number(cart.coupon.amount)) {
            coupon = Number(cart.coupon.amount) || 0;
            total -= coupon;
        }

        if (total < 0) {
            total = 0;
        }

        res.render('checkout', {
            cartItems,
            subtotal,
            offerDiscount,
            coupon,
            total,
            totalItems,
            addresses: addressDoc || { address: [] },
        });
    } catch (error) {
        console.error('Error loading checkout:', error);
        res.status(500).send('Server Error');
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

        const orderedItems = cart.items.map(item => {
            const salePrice = Number(item.price) || Number(item.productId.salePrice);
            const regularPrice = Number(item.productId.regularPrice) || salePrice;
            const quantity = Number(item.quantity) || 1;
            subtotal += salePrice * quantity;
            offerDiscount += (regularPrice - salePrice) * quantity;
            return {
                product: item.productId._id,
                quantity,
                price: salePrice,
                status: 'Pending',
            };
        });

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
            shippingCost // Add shippingCost to the order
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
        const { orderId } = req.query;
        if (!orderId) {
            return res.redirect('/cart');
        }

        res.render('order-success', { orderId });
    } catch (error) {
        console.error('Error loading order success page:', error);
        res.status(500).send('Server Error');
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

module.exports = {
    loadCheckout,
    loadPayment,
    selectAddress,
    placeOrder,
    loadOrderSuccess,
    loadWallet
};