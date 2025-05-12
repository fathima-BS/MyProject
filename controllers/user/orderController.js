
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');

const ITEMS_PER_PAGE = 10;

const getMyOrders = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/login');
    }

    const { filter = 'all', page = 1, months = 'all', search = '' } = req.query;
    let query = { userId: req.user._id };

    // Search by orderId
    if (search) {
      query.orderId = { $regex: search, $options: 'i' };
    }

    // Filter by status
    if (filter !== 'all') {
      query.status = filter;
    }

    // Filter by date range
    if (months !== 'all') {
      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - parseInt(months));
      query.createdOn = { $gte: dateThreshold };
    }

    // Pagination
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);
    const currentPage = parseInt(page) || 1;

    // Fetch orders
    const orders = await Order.find(query)
      .populate('orderedItems.product')
      .sort({ createdOn: -1 })
      .skip((currentPage - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE);

    res.render('order', {
      orders,
      filter,
      currentPage,
      totalPages,
      months,
      search,
      user: req.user,
    });
  } catch (error) {
    console.error('Error loading orders:', error.message, error.stack);
    res.status(500).render('page404', { message: 'Something went wrong while fetching orders.' });
  }
};

const orderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findOne({ orderId, userId: req.user._id })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).render('page404', { message: 'Order not found.' });
    }

    res.render('order-details', { orderId, order });
  } catch (error) {
    console.error(error);
    res.status(500).render('page404', { message: 'Something went wrong while fetching order details.' });
  }
};

// Handle Return Request for Item
const requestReturnItem = async (req, res) => {
  try {
    const { orderId, productId } = req.query;
    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.orderedItems.find(item => item.product.toString() === productId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }

    if (item.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Item cannot be returned' });
    }

    item.status = 'Return Request';
    await order.save();

    res.json({ success: true, message: 'Return request submitted' });
  } catch (error) {
    console.error('Error requesting return:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Handle Cancel Request for Item
const cancelItem = async (req, res) => {
  try {
    const { orderId, productId } = req.query;
    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.orderedItems.find(item => item.product.toString() === productId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }

    if (item.status !== 'Pending' && item.status !== 'Processing') {
      return res.status(400).json({ success: false, message: 'Item cannot be cancelled' });
    }

    item.status = 'Cancelled';
    await order.save();

    res.json({ success: true, message: 'Item cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling item:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// const requestReturn = async (req, res) => {
//   try {
//     const { orderId, productId } = req.body;

//     // Ensure the user is authenticated and owns the order
//     const order = await Order.findOne({ orderId, userId: req.user._id });
//     if (!order) {
//       return res.status(404).json({ success: false, message: 'Order not found or you are not authorized' });
//     }

//     // Find the item in orderedItems
//     const item = order.orderedItems.find(i => i.product.toString() === productId);
//     if (!item) {
//       return res.status(404).json({ success: false, message: 'Item not found in order' });
//     }

//     // Check if return is allowed (item must be delivered)
//     if (item.status !== 'Delivered') {
//       return res.status(400).json({ success: false, message: 'Return request not allowed for this item' });
//     }

//     // Set item status to 'Return Request'
//     item.status = 'Return Request';
//     await order.save();

//     res.json({ success: true, message: 'Return request submitted successfully' });
//   } catch (error) {
//     console.error('Error requesting return:', error);
//     res.status(500).json({ success: false, message: 'Error submitting return request' });
//   }
// };

module.exports = {
  getMyOrders,
  orderDetails,
 requestReturnItem,
  cancelItem,
};






  