const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');

const ITEMS_PER_PAGE = 10;

// Get My Orders
const getMyOrders = async (req, res) => {
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
        console.error('Error loading orders:', error.message, error.stack);
        res.status(500).render('page404', { message: 'Something went wrong while fetching orders.' });
    }
};

// Get Order Details
const orderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findOne({ orderId, userId: req.user?._id ? req.user?._id : req.session.user })
            .populate('orderedItems.product');

        if (!order) {
            return res.status(404).render('page404', { message: 'Order not found.' });
        }

        res.render('order-details', { orderId, order });
    } catch (error) {
        console.error('Error fetching order details:', error.message, error.stack);
        res.status(500).render('page404', { message: 'Something went wrong while fetching order details.' });
    }
};

// Cancel Entire Order
const cancelOrder = async (req, res) => {
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
        order.orderedItems.forEach(item => {
            item.status = 'Cancelled';
        });

        await order.save();
        res.status(200).json({ success: true, message: 'Order cancelled successfully.' });
    } catch (error) {
        console.error('Error cancelling order:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Something went wrong while cancelling the order.' });
    }
};

// Cancel Individual Item
const cancelItem = async (req, res) => {
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
        order.totalPrice -= item.price * item.quantity;
        order.finalAmount = order.totalPrice + (order.totalPrice >= 2000 ? 0 : order.shippingCost);

        const allItemsCancelled = order.orderedItems.every(item => item.status === 'Cancelled');
        if (allItemsCancelled) {
            order.status = 'Cancelled';
        }

        await order.save();
        res.status(200).json({ success: true, message: 'Item cancelled successfully.' });
    } catch (error) {
        console.error('Error cancelling item:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Something went wrong while cancelling the item.' });
    }
};

// Request Return for Entire Order
const returnOrder = async (req, res) => {
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
        console.error('Error requesting return:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Something went wrong while requesting the return.' });
    }
};

// Request Return for Individual Item
const returnItem = async (req, res) => {
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
        console.error('Error requesting item return:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Something went wrong while requesting the return.' });
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