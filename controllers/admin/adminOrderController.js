const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Product = require('../../models/productSchema');

const ITEMS_PER_PAGE = 10;

// List Orders with Search, Sort, Filter, and Pagination
const listOrders = async (req, res) => {
  try {
    const { page = 1, search = '', status = 'all', months = 'all', sortBy = 'createdOn' } = req.query;
    let query = {};

    if (search) {
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
        ],
      });
      const userIds = users.map(user => user._id);
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { userId: { $in: userIds } },
      ];
    }

    if (status !== 'all') {
      query.status = status;
    }

    if (months !== 'all') {
      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - parseInt(months));
      query.createdOn = { $gte: dateThreshold };
    }

    const sortOptions = {};
    if (sortBy === 'orderId') {
      sortOptions.orderId = 1; // Ascending
    } else if (sortBy === 'finalAmount') {
      sortOptions.finalAmount = -1; // Descending
    } else {
      sortOptions.createdOn = -1; // Default: sort by date descending
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);
    const currentPage = parseInt(page) || 1;

    const orders = await Order.find(query)
      .populate('userId')
      .populate('orderedItems.product')
      .sort(sortOptions)
      .skip((currentPage - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE);

    res.render('orderAdmin', {
      orders,
      currentPage,
      totalPages,
      search,
      status,
      months,
      sortBy,
    });
  } catch (error) {
    console.error('Error listing orders:', error);
    res.status(500).send('Server Error');
  }
};

// Get Order Details for Admin
const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findOne({ orderId })
            .populate('orderedItems.product');

        if (!order) {
            return res.status(404).render('/page404', { message: 'Order not found.' });
        }

        res.render('orderDetailsAdmin', { order });
    } catch (error) {
        console.error('Error fetching order details:', error.message, error.stack);
        res.status(500).render('page404', { message: 'Something went wrong while fetching order details.' });
    }
};

// Update Order Status
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        order.status = status;
        order.orderedItems.forEach(item => {
            if (item.status !== 'Cancelled' && item.status !== 'Returned' && item.status !== 'Return Rejected') {
                item.status = status;
            }
        });

        await order.save();
        res.status(200).json({ success: true, message: 'Order status updated successfully.' });
    } catch (error) {
        console.error('Error updating order status:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Something went wrong while updating the order status.' });
    }
};

// Handle Return Request (Accept/Reject)
const handleReturnRequest = async (req, res) => {
    try {
        const { orderId, productId, action, rejectReason } = req.query;

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const item = order.orderedItems.find(item => item.product.toString() === productId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found in order.' });
        }

        if (item.status !== 'Return Request') {
            return res.status(400).json({ success: false, message: 'No return request found for this item.' });
        }

        if (action === 'accept') {
            item.status = 'Returned';
        } else if (action === 'reject') {
            item.status = 'Return Rejected';
            item.returnRejectReason = rejectReason || 'Not specified';
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action.' });
        }

        const allItemsProcessed = order.orderedItems.every(item =>
            ['Delivered', 'Cancelled', 'Returned', 'Return Rejected'].includes(item.status)
        );
        if (allItemsProcessed) {
            if (order.orderedItems.some(item => item.status === 'Return Rejected')) {
                order.status = 'Return Rejected';
                order.returnRejectReason = rejectReason || 'Not specified';
            } else if (order.orderedItems.every(item => item.status === 'Returned' || item.status === 'Cancelled')) {
                order.status = 'Returned';
            } else {
                order.status = 'Delivered';
            }
        }

        await order.save();
        res.status(200).json({ success: true, message: `Return request ${action}ed successfully.` });
    } catch (error) {
        console.error('Error handling return request:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Something went wrong while processing the return request.' });
    }
};
module.exports = {
  listOrders,
  getOrderDetails,
  updateOrderStatus,
  handleReturnRequest,
};