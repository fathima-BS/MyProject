const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');

const ITEMS_PER_PAGE = 10;

// Get My Orders
const getMyOrders = async (req, res, next) => {
    try {
        req.user = req.session.userData ? req.session.userData : req.user;
        if (!req.user) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const query = { userId: req.user._id };

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);
        const currentPage = parseInt(page);

        const orders = await Order.find(query)
            .populate('orderedItems.product')
            .sort({ createdOn: -1 })
            .skip((currentPage - 1) * ITEMS_PER_PAGE)
            .limit(ITEMS_PER_PAGE);

        res.render('order', {
            orders,
            currentPage,
            totalPages,
            user: req.user,
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

// Get Order Details
const orderDetails = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findOne({ orderId, userId: req.user?._id ? req.user?._id : req.session.user })
            .populate('orderedItems.product');

        if (!order) {
            return res.status(404).render('page404', { message: 'Order not found.' });
        }

        res.render('order-details', { orderId, order });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

// Cancel Entire Order
const cancelOrder = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findOne({ orderId, userId: req.user._id });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (!['Pending', 'Processing'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Cannot cancel order in this status.' });
        }

        order.status = 'Cancelled';
        let refundAmount = order.finalAmount; // Refund the final amount (including shipping if applicable)
        order.orderedItems.forEach(item => {
            item.status = 'Cancelled';
        });

        if (order.paymentMethod !== "COD") {
            // Update wallet
            let wallet = await Wallet.findOne({ userId: req.user._id });
            if (!wallet) {
                wallet = new Wallet({
                    userId: req.user._id,
                    balance: 0,
                    transactions: [],
                });
            }

            wallet.balance += refundAmount;
            wallet.transactions.push({
                amount: refundAmount,
                type: 'credit',
                description: `Refund for cancelled order #${orderId}`,
                date: new Date(),
            });

            await Promise.all([order.save(), wallet.save()]);

        } else {
            await order.save()
        }

        res.status(200).json({ success: true, message: 'Order cancelled successfully.' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

// Cancel Individual Item
const cancelItem = async (req, res, next) => {
    try {
        const { orderId, productId } = req.body;
        const order = await Order.findOne({ orderId, userId: req.user._id });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const item = order.orderedItems.find(item => item.product.toString() === productId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order.' });
        }

        if (!['Pending', 'Processing'].includes(item.status)) {
            return res.status(400).json({ success: false, message: 'Cannot cancel item in this status.' });
        }

        item.status = 'Cancelled';
        const refundAmount = item.price * item.quantity;
        order.totalPrice -= refundAmount;
        order.finalAmount = order.totalPrice

        const allItemsCancelled = order.orderedItems.every(item => item.status === 'Cancelled');
        if (allItemsCancelled) {
            order.status = 'Cancelled';
        }

        if (order.paymentMethod !== "COD") {
            let wallet = await Wallet.findOne({ userId: req.user._id });
            if (!wallet) {
                wallet = new Wallet({
                    userId: req.user._id,
                    balance: 0,
                    transactions: [],
                });
            }

            wallet.balance += refundAmount;
            wallet.transactions.push({
                amount: refundAmount,
                type: 'credit',
                description: `Refund for cancelled item in order #${orderId}`,
                date: new Date(),
            });

            await Promise.all([order.save(), wallet.save()]);
        } else {
            await order.save()
        }


        res.status(200).json({ success: true, message: 'Item cancelled successfully.' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

// Request Return for Entire Order
const returnOrder = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findOne({ orderId, userId: req.user._id });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Cannot return order in this status.' });
        }

        order.status = 'Return Request';
        order.orderedItems.forEach(item => {
            if (item.status === 'Delivered') {
                item.status = 'Return Request';
            }
        });

        await order.save();
        res.status(200).json({ success: true, message: 'Return request submitted successfully.' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

// Request Return for Individual Item
const returnItem = async (req, res, next) => {
    try {
        const { orderId, productId } = req.body;
        const order = await Order.findOne({ orderId, userId: req.user._id });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const item = order.orderedItems.find(item => item.product.toString() === productId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order.' });
        }

        if (item.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Cannot return item in this status.' });
        }

        item.status = 'Return Request';
        const allItemsDeliveredOrReturning = order.orderedItems.every(item =>
            ['Delivered', 'Return Request', 'Returned', 'Return Rejected'].includes(item.status)
        );
        if (allItemsDeliveredOrReturning) {
            order.status = 'Return Request';
        }

        await order.save();
        res.status(200).json({ success: true, message: 'Return request submitted successfully.' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

module.exports = {
    getMyOrders,
    orderDetails,
    cancelOrder,
    cancelItem,
    returnOrder,
    returnItem,
};