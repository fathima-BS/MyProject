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

    // Search by orderId or customer name
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

    // Filter by status
    if (status !== 'all') {
      query.status = status;
    }

    // Filter by date range
    if (months !== 'all') {
      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - parseInt(months));
      query.createdOn = { $gte: dateThreshold };
    }

    // Sorting
    const sortOptions = {};
    if (sortBy === 'orderId') {
      sortOptions.orderId = 1; // Ascending
    } else if (sortBy === 'finalAmount') {
      sortOptions.finalAmount = -1; // Descending
    } else {
      sortOptions.createdOn = -1; // Default: sort by date descending
    }

    // Pagination
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);
    const currentPage = parseInt(page) || 1;

    // Fetch orders
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

// View Order Details
const viewOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId })
      .populate('userId')
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).send('Order not found');
    }

    res.render('orderDetailsAdmin', { order });
  } catch (error) {
    console.error('Error viewing order details:', error);
    res.status(500).send('Server Error');
  }
};

// Update Order Status
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Update the overall order status
    order.status = status;
    order.orderedItems = order.orderedItems.map(item => ({
      ...item.toObject(),
      status: status,
    }));

    await order.save();

    res.json({ success: true, message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Error updating status' });
  }
};

// Handle Return Request
const handleReturnRequest = async (req, res) => {
  try {
    const { orderId, productId, action } = req.query;

    const order = await Order.findOne({ orderId })
      .populate('userId')
      .populate('orderedItems.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.orderedItems.find(i => i.product._id.toString() === productId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }

    if (item.status !== 'Return Request') {
      return res.status(400).json({ success: false, message: 'No return request to process for this item' });
    }

    if (action === 'accept') {
      item.status = 'Returned';

      // Refund the item amount to the user's wallet
      let wallet = await Wallet.findOne({ userId: order.userId });
      if (!wallet) {
        wallet = new Wallet({ userId: order.userId, balance: 0, transactions: [] });
      }

      const refundAmount = item.price * item.quantity;
      wallet.balance += refundAmount;
      wallet.transactions.push({
        amount: refundAmount,
        type: 'credit',
        description: `Refund for item in order #${order.orderId}`,
        date: new Date(),
      });
      await wallet.save();

      // Restore product quantity
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { quantity: item.quantity },
      });

      // Update order status if all items are returned
      const allReturned = order.orderedItems.every(i => i.status === 'Returned');
      if (allReturned) order.status = 'Returned';

      await order.save();
      res.json({ success: true, message: 'Return approved and amount refunded to wallet' });
    } else if (action === 'reject') {
      item.status = 'Delivered';
      await order.save();
      res.json({ success: true, message: 'Return request rejected' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error handling return request:', error);
    res.status(500).json({ success: false, message: 'Error processing return request' });
  }
};

module.exports = {
  listOrders,
  viewOrderDetails,
  updateOrderStatus,
  handleReturnRequest,
};